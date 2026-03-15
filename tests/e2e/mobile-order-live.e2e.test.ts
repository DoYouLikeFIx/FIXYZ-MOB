import { createHmac, randomUUID } from 'node:crypto';

import { createAuthApi } from '@/api/auth-api';
import { createOrderApi } from '@/api/order-api';
import { createAuthFlowViewModel } from '@/auth/auth-flow-view-model';
import { createMobileAuthService } from '@/auth/mobile-auth-service';
import { InMemoryCookieManager } from '@/network/cookie-manager';
import { CsrfTokenManager } from '@/network/csrf';
import { HttpClient } from '@/network/http-client';
import { createAuthNavigationState } from '@/navigation/auth-navigation';
import { authStore, resetAuthStore } from '@/store/auth-store';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const LIVE_BASE_URL = process.env.LIVE_API_BASE_URL?.trim() ?? '';
const DEFAULT_REGISTER_PASSWORD = 'LiveMobOrder1!';

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
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  return {
    email: `mob_order_live_${suffix}@example.com`,
    name: `Mob Order ${suffix}`,
    password: process.env.LIVE_REGISTER_PASSWORD ?? DEFAULT_REGISTER_PASSWORD,
  };
};

const decodeBase32 = (value: string): Buffer => {
  const normalized = value.trim().replace(/=/g, '').toUpperCase();
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

const millisUntilNextTotpWindow = (now = Date.now()) => 30_000 - (now % 30_000);

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
  const orderApi = createOrderApi({
    client,
  });
  const viewModel = createAuthFlowViewModel({
    authService,
    authStore,
    initialNavigationState: createAuthNavigationState(),
  });

  return {
    authService,
    orderApi,
    viewModel,
  };
};

const registerEnrollAndLogin = async (baseUrl: string) => {
  const identity = createLiveIdentity();
  const registrationHarness = createLiveHarness(baseUrl);

  const registerResult = await registrationHarness.viewModel.submitRegister({
    email: identity.email,
    name: identity.name,
    password: identity.password,
  });

  expect(registerResult).toEqual({
    success: true,
  });

  const pendingMfaAfterRegister = registrationHarness.viewModel.getState().pendingMfa;
  expect(pendingMfaAfterRegister).toMatchObject({
    nextAction: 'ENROLL_TOTP',
  });
  expect(pendingMfaAfterRegister?.loginToken).toBeTruthy();

  const enrollmentBootstrap = await registrationHarness.viewModel.loadTotpEnrollment();
  expect(enrollmentBootstrap.success).toBe(true);
  if (!enrollmentBootstrap.success) {
    throw enrollmentBootstrap.error;
  }

  const pendingMfa = registrationHarness.viewModel.getState().pendingMfa;
  expect(pendingMfa?.loginToken).toBeTruthy();

  const manualEntryKey = enrollmentBootstrap.enrollment.manualEntryKey;
  const enrollmentCode = generateTotp(manualEntryKey);

  const enrollmentResult = await registrationHarness.viewModel.submitTotpEnrollmentConfirmation({
    loginToken: pendingMfa!.loginToken,
    enrollmentToken: enrollmentBootstrap.enrollment.enrollmentToken,
    otpCode: enrollmentCode,
  });

  expect(enrollmentResult).toEqual({
    success: true,
  });

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

  const loginCode = await waitForNextTotp(manualEntryKey, enrollmentCode);
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
    accountId: Number(member!.accountId),
    loginHarness,
    manualEntryKey,
    lastUsedTotp: loginCode,
  };
};

const createHighRiskOrderSession = async (
  loginHarness: ReturnType<typeof createLiveHarness>,
  accountId: number,
) => {
  return loginHarness.orderApi.createOrderSession({
    accountId,
    clOrdId: randomUUID(),
    symbol: '005930',
    side: 'BUY',
    quantity: 10,
    price: 70_500,
  });
};

describe.runIf(Boolean(LIVE_BASE_URL))('Live mobile order session against backend', () => {
  beforeAll(() => {
    authStore.initialize(null);
  });

  beforeEach(() => {
    resetAuthStore();
  });

  afterAll(() => {
    resetAuthStore();
  });

  it('registers, enrolls TOTP, logs in with fresh MFA, and completes a challenged order session', async () => {
    const {
      accountId,
      loginHarness,
      manualEntryKey,
      lastUsedTotp,
    } = await registerEnrollAndLogin(LIVE_BASE_URL);

    const createdSession = await createHighRiskOrderSession(loginHarness, accountId);

    expect(createdSession).toMatchObject({
      status: 'PENDING_NEW',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
      symbol: '005930',
      qty: 10,
    });

    const fetchedSession = await loginHarness.orderApi.getOrderSession(createdSession.orderSessionId);
    expect(fetchedSession).toMatchObject({
      orderSessionId: createdSession.orderSessionId,
      status: 'PENDING_NEW',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
    });

    const orderOtpCode = await waitForNextTotp(manualEntryKey, lastUsedTotp);
    const verifiedSession = await loginHarness.orderApi.verifyOrderSessionOtp(
      createdSession.orderSessionId,
      orderOtpCode,
    );
    expect(verifiedSession).toMatchObject({
      orderSessionId: createdSession.orderSessionId,
      status: 'AUTHED',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
    });

    const executedSession = await loginHarness.orderApi.executeOrderSession(
      createdSession.orderSessionId,
    );
    expect(executedSession.status).toBe('COMPLETED');
    expect(executedSession.executionResult).toBeTruthy();
    expect(executedSession.externalOrderId).toBeTruthy();
  }, 150_000);

  it('rejects same-window TOTP replay across order sessions and allows recovery on a fresh code', async () => {
    const {
      accountId,
      loginHarness,
      manualEntryKey,
      lastUsedTotp,
    } = await registerEnrollAndLogin(LIVE_BASE_URL);

    const firstSession = await createHighRiskOrderSession(loginHarness, accountId);
    const replayedCode = await waitForNextTotp(manualEntryKey, lastUsedTotp);

    const firstVerified = await loginHarness.orderApi.verifyOrderSessionOtp(
      firstSession.orderSessionId,
      replayedCode,
    );
    expect(firstVerified).toMatchObject({
      orderSessionId: firstSession.orderSessionId,
      status: 'AUTHED',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
    });

    const secondSession = await createHighRiskOrderSession(loginHarness, accountId);

    await expect(
      loginHarness.orderApi.verifyOrderSessionOtp(secondSession.orderSessionId, replayedCode),
    ).rejects.toMatchObject({
      code: 'AUTH-011',
      status: 401,
    });

    const pendingSecondSession = await loginHarness.orderApi.getOrderSession(secondSession.orderSessionId);
    expect(pendingSecondSession).toMatchObject({
      orderSessionId: secondSession.orderSessionId,
      status: 'PENDING_NEW',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
    });

    const recoveryCode = await waitForNextTotp(manualEntryKey, replayedCode);
    const recoveredSession = await loginHarness.orderApi.verifyOrderSessionOtp(
      secondSession.orderSessionId,
      recoveryCode,
    );
    expect(recoveredSession).toMatchObject({
      orderSessionId: secondSession.orderSessionId,
      status: 'AUTHED',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
    });

    const executedRecoveredSession = await loginHarness.orderApi.executeOrderSession(
      secondSession.orderSessionId,
    );
    expect(executedRecoveredSession.status).toBe('COMPLETED');
    expect(executedRecoveredSession.executionResult).toBeTruthy();
    expect(executedRecoveredSession.externalOrderId).toBeTruthy();
  }, 180_000);
});
