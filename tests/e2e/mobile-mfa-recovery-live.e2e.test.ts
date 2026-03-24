import { createHmac } from 'node:crypto';

import { createAuthApi } from '@/api/auth-api';
import { createAuthFlowViewModel } from '@/auth/auth-flow-view-model';
import { createMobileAuthService } from '@/auth/mobile-auth-service';
import { InMemoryCookieManager } from '@/network/cookie-manager';
import { CsrfTokenManager } from '@/network/csrf';
import { HttpClient } from '@/network/http-client';
import { createAuthNavigationState } from '@/navigation/auth-navigation';
import { authStore, resetAuthStore } from '@/store/auth-store';
import type { CookieValue } from '@/network/cookie-manager';
import { resolveLiveHarnessBaseUrl } from './live-runtime-config';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const LIVE_BASE_URL = resolveLiveHarnessBaseUrl();

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

  async read(url: string, key: string): Promise<CookieValue | undefined> {
    const cookies = await this.get(url);
    return cookies[key];
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
    email: `mob_mfa_recovery_live_${suffix}@example.com`,
    name: `Mob MFA ${suffix}`,
    password: 'LiveMob1!',
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

const waitForNextTotp = async (
  manualEntryKey: string,
  previousCode: string,
): Promise<string> => {
  const startedAt = Date.now();
  let nextCode = generateTotp(manualEntryKey);

  while (nextCode === previousCode) {
    if (Date.now() - startedAt > 45_000) {
      throw new Error('Timed out waiting for the next TOTP window.');
    }

    await delay(1_000);
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
  const viewModel = createAuthFlowViewModel({
    authService,
    authStore,
    initialNavigationState: createAuthNavigationState(),
  });

  return {
    authService,
    cookieManager,
    viewModel,
  };
};

describe.runIf(Boolean(LIVE_BASE_URL))('Live mobile MFA recovery against backend', () => {
  beforeAll(() => {
    authStore.initialize(null);
  });

  beforeEach(() => {
    resetAuthStore();
  });

  afterAll(() => {
    resetAuthStore();
  });

  it('registers, enrolls TOTP, rebinds authenticator, invalidates the previous session, and requires the new secret on the next login', async () => {
    const identity = createLiveIdentity();
    const harness = createLiveHarness(LIVE_BASE_URL);

    const registerResult = await harness.viewModel.submitRegister({
      email: identity.email,
      name: identity.name,
      password: identity.password,
    });

    expect(registerResult).toEqual({
      success: true,
    });
    expect(harness.viewModel.getState().navigationState).toMatchObject({
      stack: 'auth',
      authRoute: 'totpEnroll',
    });

    const enrollmentBootstrap = await harness.viewModel.loadTotpEnrollment();

    expect(enrollmentBootstrap.success).toBe(true);
    if (!enrollmentBootstrap.success) {
      throw enrollmentBootstrap.error;
    }

    const originalManualKey = enrollmentBootstrap.enrollment.manualEntryKey;
    const originalConfirmCode = generateTotp(originalManualKey);
    const pendingMfa = harness.viewModel.getState().pendingMfa;

    expect(pendingMfa?.loginToken).toBeTruthy();

    const enrollmentResult = await harness.viewModel.submitTotpEnrollmentConfirmation({
      loginToken: pendingMfa!.loginToken,
      enrollmentToken: enrollmentBootstrap.enrollment.enrollmentToken,
      otpCode: originalConfirmCode,
    });

    expect(enrollmentResult).toEqual({
      success: true,
    });
    expect(authStore.getState()).toMatchObject({
      status: 'authenticated',
      member: {
        email: identity.email,
        totpEnrolled: true,
      },
    });

    harness.viewModel.openAuthenticatedMfaRecovery();
    expect(harness.viewModel.getState().navigationState).toMatchObject({
      stack: 'auth',
      authRoute: 'mfaRecovery',
    });

    const rebindBootstrap = await harness.viewModel.bootstrapAuthenticatedMfaRecovery({
      currentPassword: identity.password,
    });

    expect(rebindBootstrap.success).toBe(true);
    if (!rebindBootstrap.success) {
      throw rebindBootstrap.error;
    }

    const reboundManualKey = rebindBootstrap.bootstrap.manualEntryKey;
    const reboundConfirmCode = generateTotp(reboundManualKey);
    const rebindResult = await harness.viewModel.submitMfaRecoveryRebindConfirmation({
      rebindToken: rebindBootstrap.bootstrap.rebindToken,
      enrollmentToken: rebindBootstrap.bootstrap.enrollmentToken,
      otpCode: reboundConfirmCode,
    });

    expect(rebindResult.success).toBe(true);
    if (!rebindResult.success) {
      throw rebindResult.error;
    }

    expect(rebindResult.response).toMatchObject({
      rebindCompleted: true,
      reauthRequired: true,
    });
    expect(authStore.getState()).toMatchObject({
      status: 'anonymous',
      member: null,
    });
    expect(harness.viewModel.getState()).toMatchObject({
      authBannerTone: 'success',
      navigationState: {
        stack: 'auth',
        authRoute: 'login',
      },
      mfaRecovery: null,
    });

    const staleSessionCheck = await harness.authService.refreshProtectedSession();
    expect(staleSessionCheck.status).toBe('reauth');

    const nextLogin = await harness.viewModel.submitLogin({
      email: identity.email,
      password: identity.password,
    });

    expect(nextLogin).toEqual({
      success: true,
    });

    const loginToken = harness.viewModel.getState().pendingMfa?.loginToken;
    expect(loginToken).toBeTruthy();

    const oldSecretLoginCode = await waitForNextTotp(originalManualKey, originalConfirmCode);
    const oldSecretLoginAttempt = await harness.viewModel.submitLoginMfa({
      loginToken: loginToken!,
      otpCode: oldSecretLoginCode,
    });

    expect(oldSecretLoginAttempt.success).toBe(false);
    if (oldSecretLoginAttempt.success) {
      throw new Error('Old secret unexpectedly passed after rebind.');
    }
    expect((oldSecretLoginAttempt.error as { code?: string }).code).toBe('AUTH-010');

    const reboundLoginCode = await waitForNextTotp(reboundManualKey, reboundConfirmCode);
    const reboundLoginAttempt = await harness.viewModel.submitLoginMfa({
      loginToken: loginToken!,
      otpCode: reboundLoginCode,
    });

    expect(reboundLoginAttempt).toEqual({
      success: true,
    });
    expect(authStore.getState()).toMatchObject({
      status: 'authenticated',
      member: {
        email: identity.email,
        totpEnrolled: true,
      },
    });
    expect(harness.viewModel.getState().navigationState).toMatchObject({
      stack: 'app',
      welcomeVariant: 'login',
    });
  }, 90_000);
});
