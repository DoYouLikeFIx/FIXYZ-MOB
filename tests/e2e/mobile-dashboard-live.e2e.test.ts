import { createHmac } from 'node:crypto';

import { createAccountApi } from '@/api/account-api';
import { createAuthApi } from '@/api/auth-api';
import { createAuthFlowViewModel } from '@/auth/auth-flow-view-model';
import { createMobileAuthService } from '@/auth/mobile-auth-service';
import { InMemoryCookieManager } from '@/network/cookie-manager';
import { CsrfTokenManager } from '@/network/csrf';
import { HttpClient } from '@/network/http-client';
import { createAuthNavigationState } from '@/navigation/auth-navigation';
import { authStore, resetAuthStore } from '@/store/auth-store';
import type { AccountPosition, AccountSummary } from '@/types/account';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const LIVE_BASE_URL = process.env.LIVE_API_BASE_URL?.trim() ?? '';
const LIVE_REQUEST_TIMEOUT_MS = 30_000;
const LIVE_AUTH_PREFLIGHT_TIMEOUT_MS = 15_000;
const DEFAULT_REGISTER_PASSWORD = 'LiveMobDashboard1!';
const DEFAULT_EXISTING_NAME = 'Live Mob Dashboard';
const LIVE_EMAIL = process.env.LIVE_EMAIL?.trim() ?? '';
const LIVE_PASSWORD = (
  process.env.LIVE_PASSWORD?.trim()
  ?? process.env.LIVE_REGISTER_PASSWORD?.trim()
  ?? ''
);
const LIVE_NAME = process.env.LIVE_NAME?.trim() ?? DEFAULT_EXISTING_NAME;
const LIVE_TOTP_KEY = process.env.LIVE_TOTP_KEY?.trim() ?? '';
const HAS_REUSABLE_HOLDINGS_ACCOUNT = Boolean(LIVE_EMAIL && LIVE_PASSWORD && LIVE_TOTP_KEY);

class LiveCookieManager extends InMemoryCookieManager {
  async cookieHeader(url: string): Promise<string | undefined> {
    const cookies = await this.get(url);
    const serialized = Object.entries(cookies)
      .map(([key, value]) => [key, value.value].join('='))
      .filter((entry) => !entry.endsWith('='))
      .join('; ');

    return serialized || undefined;
  }

  rememberSetCookie(url: string, setCookieHeader: string): void {
    const [pair] = setCookieHeader.split(';', 1);
    const separatorIndex = pair.indexOf('=');

    if (separatorIndex <= 0) {
      return;
    }

    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();

    this.setCookie(url, key, value);
  }
}

const readSetCookieHeaders = (headers: Headers): string[] => {
  const candidate = headers as Headers & {
    getSetCookie?: () => string[];
  };

  if (typeof candidate.getSetCookie === 'function') {
    return candidate.getSetCookie();
  }

  const single = headers.get('set-cookie');
  return single ? [single] : [];
};

const createCookieAwareFetch = (
  baseUrl: string,
  cookieManager: LiveCookieManager,
) => {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    const cookieHeader = await cookieManager.cookieHeader(baseUrl);

    if (cookieHeader) {
      headers.set('Cookie', cookieHeader);
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });

    for (const setCookie of readSetCookieHeaders(response.headers)) {
      cookieManager.rememberSetCookie(baseUrl, setCookie);
    }

    return response;
  };
};

const createLiveIdentity = () => {
  if (LIVE_EMAIL && LIVE_PASSWORD) {
    return {
      email: LIVE_EMAIL,
      name: LIVE_NAME,
      password: LIVE_PASSWORD,
      reuseExistingAccount: true,
    };
  }

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  return {
    email: `mob_dashboard_live_${suffix}@example.com`,
    name: `Mob Dashboard ${suffix}`,
    password: process.env.LIVE_REGISTER_PASSWORD ?? DEFAULT_REGISTER_PASSWORD,
    reuseExistingAccount: false,
  };
};

const decodeBase32 = (value: string): Buffer => {
  const normalized = value.trim().replace(/[\s=-]/g, '').toUpperCase();
  let buffer = 0;
  let bitsLeft = 0;
  const output: number[] = [];

  for (const character of normalized) {
    const index = BASE32_ALPHABET.indexOf(character);

    if (index < 0) {
      throw new Error(`Unsupported base32 character: ${character}`);
    }

    buffer = (buffer << 5) | index;
    bitsLeft += 5;

    if (bitsLeft >= 8) {
      output.push((buffer >> (bitsLeft - 8)) & 0xff);
      bitsLeft -= 8;
    }
  }

  return Buffer.from(output);
};

const generateTotp = (manualEntryKey: string, now = Date.now()): string => {
  const counter = Math.floor(now / 1000 / 30);
  const counterBuffer = Buffer.alloc(8);

  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', decodeBase32(manualEntryKey))
    .update(counterBuffer)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const fetchWithTimeout = async (
  input: string,
  init: RequestInit,
  timeoutMs: number,
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
};

const unwrapEnvelope = <T extends Record<string, unknown>>(payload: T) =>
  (
    'data' in payload
    && typeof payload.data === 'object'
    && payload.data !== null
  )
    ? payload.data as T
    : payload;

const createPreflightEmail = () =>
  `mob-dashboard-preflight-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@example.com`;

const serializeSetCookies = (headers: Headers) =>
  readSetCookieHeaders(headers)
    .map((cookie) => cookie.split(';', 1)[0]?.trim() ?? '')
    .filter(Boolean)
    .join('; ');

const expectProtectedDashboardStatus = (status: number) => {
  expect([401, 403, 410]).toContain(status);
};

const requireLiveAuthContractHealthy = async (baseUrl: string) => {
  const startedAt = Date.now();
  let lastError: Error | null = null;

  while (Date.now() - startedAt <= LIVE_REQUEST_TIMEOUT_MS) {
    try {
      const csrfResponse = await fetchWithTimeout(
        `${baseUrl}/api/v1/auth/csrf`,
        {
          method: 'GET',
          credentials: 'include',
        },
        LIVE_AUTH_PREFLIGHT_TIMEOUT_MS,
      );

      if (!csrfResponse.ok) {
        throw new Error(`csrf preflight returned ${csrfResponse.status}`);
      }

      const csrfPayload = unwrapEnvelope(await csrfResponse.json() as Record<string, unknown>);
      const csrfToken = String(csrfPayload.csrfToken ?? csrfPayload.token ?? '');
      const csrfHeaderName = String(csrfPayload.headerName ?? 'X-CSRF-TOKEN');
      const cookieHeader = serializeSetCookies(csrfResponse.headers);

      if (!csrfToken) {
        throw new Error('csrf preflight did not return a csrf token');
      }

      const forgotResponse = await fetchWithTimeout(
        `${baseUrl}/api/v1/auth/password/forgot`,
        {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            [csrfHeaderName]: csrfToken,
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          },
          body: JSON.stringify({
            email: createPreflightEmail(),
          }),
        },
        LIVE_AUTH_PREFLIGHT_TIMEOUT_MS,
      );

      if (!forgotResponse.ok) {
        throw new Error(`forgot-password preflight returned ${forgotResponse.status}`);
      }

      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await delay(1_000);
    }
  }

  throw new Error(
    `LIVE auth prerequisite is unhealthy for mobile dashboard E2E: ${lastError?.message ?? 'unknown failure'}`,
  );
};

const millisUntilNextTotpWindow = (now = Date.now()) => 30_000 - (now % 30_000);

const generateStableTotp = async (
  manualEntryKey: string,
  minRemainingMs = 8_000,
) => {
  if (millisUntilNextTotpWindow() < minRemainingMs) {
    await delay(millisUntilNextTotpWindow() + 1_500);
  }

  return generateTotp(manualEntryKey);
};

const waitForNextTotp = async (
  manualEntryKey: string,
  previousCode: string,
): Promise<string> => {
  const startedAt = Date.now();
  let nextCode = generateTotp(manualEntryKey);

  while (nextCode === previousCode || millisUntilNextTotpWindow() < 10_000) {
    if (Date.now() - startedAt > 45_000) {
      throw new Error('Timed out waiting for the next TOTP window.');
    }

    await delay(250);
    nextCode = generateTotp(manualEntryKey);
  }

  return nextCode;
};

const createLiveHarness = (baseUrl: string) => {
  const cookieManager = new LiveCookieManager();
  const fetchFn = createCookieAwareFetch(baseUrl, cookieManager);
  const bootstrapClient = new HttpClient({
    baseUrl,
    fetchFn,
    timeoutMs: LIVE_REQUEST_TIMEOUT_MS,
  });
  const csrfManager = new CsrfTokenManager({
    baseUrl,
    cookieManager,
    bootstrapCsrf: async () => {
      const response = await bootstrapClient.get<{ csrfToken?: string; token?: string; headerName?: string }>(
        '/api/v1/auth/csrf',
      );
      const token = response.body.csrfToken ?? response.body.token ?? '';

      if (token) {
        cookieManager.setCookie(baseUrl, 'XSRF-TOKEN', token);
      }

      return response.body;
    },
  });
  const client = new HttpClient({
    baseUrl,
    fetchFn,
    csrfManager,
    timeoutMs: LIVE_REQUEST_TIMEOUT_MS,
  });
  const authApi = createAuthApi({
    client,
    csrfManager,
  });
  const authService = createMobileAuthService({
    authApi,
    csrfManager,
    appBootstrap: {
      baseUrl,
      client: bootstrapClient,
      csrfManager,
      strictCsrfBootstrap: true,
    },
  });
  const viewModel = createAuthFlowViewModel({
    authService,
    authStore,
    initialNavigationState: createAuthNavigationState(),
  });
  const accountApi = createAccountApi({
    client,
  });

  return {
    accountApi,
    viewModel,
  };
};

const registerEnrollAndLogin = async (baseUrl: string) => {
  await requireLiveAuthContractHealthy(baseUrl);
  const identity = createLiveIdentity();
  let manualEntryKey = LIVE_TOTP_KEY;
  let enrollmentCode = '';

  if (!identity.reuseExistingAccount) {
    const registrationHarness = createLiveHarness(baseUrl);

    const registerResult = await registrationHarness.viewModel.submitRegister({
      email: identity.email,
      name: identity.name,
      password: identity.password,
    });

    expect(registerResult).toEqual({
      success: true,
    });

    const enrollmentBootstrap = await registrationHarness.viewModel.loadTotpEnrollment();
    expect(enrollmentBootstrap.success).toBe(true);
    if (!enrollmentBootstrap.success) {
      throw enrollmentBootstrap.error;
    }

    const pendingMfa = registrationHarness.viewModel.getState().pendingMfa;
    expect(pendingMfa?.loginToken).toBeTruthy();

    manualEntryKey = enrollmentBootstrap.enrollment.manualEntryKey;
    enrollmentCode = await generateStableTotp(manualEntryKey);
    const enrollmentResult = await registrationHarness.viewModel.submitTotpEnrollmentConfirmation({
      loginToken: pendingMfa!.loginToken,
      enrollmentToken: enrollmentBootstrap.enrollment.enrollmentToken,
      otpCode: enrollmentCode,
    });

    expect(enrollmentResult).toEqual({
      success: true,
    });
  }

  resetAuthStore();
  const loginHarness = createLiveHarness(baseUrl);
  const loginResult = await loginHarness.viewModel.submitLogin({
    email: identity.email,
    password: identity.password,
  });

  expect(loginResult).toEqual({
    success: true,
  });

  const loginToken = loginHarness.viewModel.getState().pendingMfa?.loginToken;
  expect(loginToken).toBeTruthy();

  if (!manualEntryKey) {
    throw new Error(
      'LIVE_TOTP_KEY is required when running the mobile dashboard live test against an existing account.',
    );
  }

  const loginCode = identity.reuseExistingAccount
    ? await generateStableTotp(manualEntryKey)
    : await waitForNextTotp(manualEntryKey, enrollmentCode);
  const mfaResult = await loginHarness.viewModel.submitLoginMfa({
    loginToken: loginToken!,
    otpCode: loginCode,
  });

  expect(mfaResult).toEqual({
    success: true,
  });

  const member = authStore.getState().member;
  expect(member?.accountId).toBeTruthy();

  return {
    accountId: String(member!.accountId),
    loginHarness,
  };
};

const isChartReadyPosition = (position: AccountPosition | AccountSummary) => {
  const marketPrice = 'marketPrice' in position ? position.marketPrice : undefined;
  const quoteAsOf = 'quoteAsOf' in position ? position.quoteAsOf : undefined;
  const quoteSourceMode = 'quoteSourceMode' in position ? position.quoteSourceMode : undefined;
  const valuationStatus = 'valuationStatus' in position ? position.valuationStatus : undefined;

  return (
    valuationStatus === 'FRESH'
    && marketPrice !== null
    && marketPrice !== undefined
    && Boolean(quoteAsOf)
    && ['LIVE', 'DELAYED', 'REPLAY'].includes(quoteSourceMode ?? '')
  );
};

const resolveAvailableQuantity = (position: AccountPosition) =>
  position.availableQuantity ?? position.availableQty;

const expectDashboardBootstrapSnapshot = (
  accountId: string,
  summary: AccountSummary,
  positions: AccountPosition[],
) => {
  expect(summary.accountId).toBe(Number(accountId));
  expect(summary.balance).toBeGreaterThanOrEqual(0);
  expect(summary.availableBalance).toBeGreaterThanOrEqual(0);
  expect(summary.currency).toBeTruthy();
  expect(summary.asOf).toBeTruthy();
  expect(Number.isNaN(Date.parse(summary.asOf))).toBe(false);

  expect(Array.isArray(positions)).toBe(true);

  for (const position of positions) {
    const availableQuantity = resolveAvailableQuantity(position);

    expect(position.accountId).toBe(Number(accountId));
    expect(position.symbol).toBeTruthy();
    expect(position.quantity).toBeGreaterThan(0);
    expect(availableQuantity).toBeGreaterThanOrEqual(0);
    expect(availableQuantity).toBeLessThanOrEqual(position.quantity);
    expect(position.currency).toBeTruthy();
    expect(position.asOf).toBeTruthy();
    expect(Number.isNaN(Date.parse(position.asOf))).toBe(false);
  }
};

const waitForDashboardChartData = async (
  loginHarness: ReturnType<typeof createLiveHarness>,
  accountId: string,
) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt <= 20_000) {
    const summary = await loginHarness.accountApi.fetchAccountSummary({
      accountId,
    });
    const positions = await loginHarness.accountApi.fetchAccountPositions({
      accountId,
    });

    if (
      positions.length > 0
      && (isChartReadyPosition(summary) || positions.some((position) => isChartReadyPosition(position)))
    ) {
      return {
        positions,
        summary,
      };
    }

    await delay(1_000);
  }

  return {
    positions: await loginHarness.accountApi.fetchAccountPositions({
      accountId,
    }),
    summary: await loginHarness.accountApi.fetchAccountSummary({
      accountId,
    }),
  };
};

const formatDashboardDebugSnapshot = (input: {
  accountId: string;
  summary: AccountSummary;
  positions: AccountPosition[];
}) =>
  JSON.stringify(
    {
      accountIdPresent: Boolean(input.accountId),
      summary: {
        currency: input.summary.currency,
        asOfPresent: Boolean(input.summary.asOf),
        balancePresent: input.summary.balance !== null && input.summary.balance !== undefined,
        availableBalancePresent:
          input.summary.availableBalance !== null && input.summary.availableBalance !== undefined,
        valuationStatus: 'valuationStatus' in input.summary ? input.summary.valuationStatus ?? null : null,
        marketPricePresent: 'marketPrice' in input.summary
          ? input.summary.marketPrice !== null && input.summary.marketPrice !== undefined
          : false,
        quoteAsOfPresent: 'quoteAsOf' in input.summary ? Boolean(input.summary.quoteAsOf) : false,
        quoteSourceMode: 'quoteSourceMode' in input.summary
          ? input.summary.quoteSourceMode ?? null
          : null,
      },
      positionsCount: input.positions.length,
      positions: input.positions.map((position, index) => ({
        index,
        hasSymbol: Boolean(position.symbol),
        quantityPresent: position.quantity > 0,
        availableQuantityPresent: resolveAvailableQuantity(position) !== null
          && resolveAvailableQuantity(position) !== undefined,
        currency: position.currency,
        asOfPresent: Boolean(position.asOf),
        valuationStatus: position.valuationStatus ?? null,
        marketPricePresent: position.marketPrice !== null && position.marketPrice !== undefined,
        quoteSnapshotPresent: Boolean(position.quoteSnapshotId),
        quoteAsOfPresent: Boolean(position.quoteAsOf),
        quoteSourceMode: position.quoteSourceMode ?? null,
      })),
    },
    null,
    2,
  );

describe.runIf(Boolean(LIVE_BASE_URL))('Live mobile dashboard against backend', () => {
  beforeAll(() => {
    authStore.initialize(null);
  });

  beforeEach(() => {
    resetAuthStore();
  });

  afterAll(() => {
    resetAuthStore();
  });

  it('rejects unauthenticated dashboard account endpoints before mobile login bootstrap', async () => {
    await requireLiveAuthContractHealthy(LIVE_BASE_URL);

    const summaryResponse = await fetchWithTimeout(
      `${LIVE_BASE_URL}/api/v1/accounts/999999/summary`,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      },
      LIVE_AUTH_PREFLIGHT_TIMEOUT_MS,
    );
    const positionsResponse = await fetchWithTimeout(
      `${LIVE_BASE_URL}/api/v1/accounts/999999/positions/list`,
      {
        method: 'GET',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
        },
      },
      LIVE_AUTH_PREFLIGHT_TIMEOUT_MS,
    );

    expectProtectedDashboardStatus(summaryResponse.status);
    expectProtectedDashboardStatus(positionsResponse.status);
  }, 120_000);

  const holdingsBackedDashboardParity = HAS_REUSABLE_HOLDINGS_ACCOUNT ? it : it.skip;

  holdingsBackedDashboardParity(
    'keeps holdings-backed dashboard summary and positions aligned after MFA login',
    async () => {
      const { accountId, loginHarness } = await registerEnrollAndLogin(LIVE_BASE_URL);
      const { summary, positions } = await waitForDashboardChartData(loginHarness, accountId);
      const chartReadyPosition = positions.find((position) => isChartReadyPosition(position));

      expectDashboardBootstrapSnapshot(accountId, summary, positions);

      if (!chartReadyPosition) {
        throw new Error(
          `Configured live dashboard account must expose at least one chart-ready position for parity assertions.\n${
            formatDashboardDebugSnapshot({
              accountId,
              summary,
              positions,
            })
          }`,
        );
      }

      const availableQuantity = resolveAvailableQuantity(chartReadyPosition);
      expect(positions.length).toBeGreaterThan(0);
      expect(availableQuantity).toBeGreaterThanOrEqual(0);
      expect(availableQuantity).toBeLessThanOrEqual(chartReadyPosition.quantity);
      expect(chartReadyPosition.valuationStatus).toBe('FRESH');
      expect(chartReadyPosition.marketPrice).toBeGreaterThan(0);
      expect(chartReadyPosition.quoteSnapshotId).toBeTruthy();
      expect(chartReadyPosition.quoteSourceMode).toMatch(/^(LIVE|DELAYED|REPLAY)$/);
      expect(chartReadyPosition.quoteAsOf).toBeTruthy();
      expect(Number.isNaN(Date.parse(chartReadyPosition.quoteAsOf!))).toBe(false);

      if (chartReadyPosition.avgPrice != null) {
        expect(chartReadyPosition.avgPrice).toBeGreaterThan(0);
      }
    },
    120_000,
  );

  it('returns dashboard bootstrap data after fresh MFA login', async () => {
    const { accountId, loginHarness } = await registerEnrollAndLogin(LIVE_BASE_URL);
    const summary = await loginHarness.accountApi.fetchAccountSummary({
      accountId,
    });
    const positions = await loginHarness.accountApi.fetchAccountPositions({
      accountId,
    });

    expectDashboardBootstrapSnapshot(accountId, summary, positions);
  }, 120_000);
});
