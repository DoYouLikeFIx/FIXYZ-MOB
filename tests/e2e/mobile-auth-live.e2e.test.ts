import { createAuthApi } from '@/api/auth-api';
import {
  getLoginErrorFeedback,
  resolveAuthErrorPresentation,
} from '@/auth/auth-errors';
import { createAuthFlowViewModel } from '@/auth/auth-flow-view-model';
import { createMobileAuthService } from '@/auth/mobile-auth-service';
import { InMemoryCookieManager } from '@/network/cookie-manager';
import { CsrfTokenManager } from '@/network/csrf';
import { HttpClient } from '@/network/http-client';
import { createAuthNavigationState } from '@/navigation/auth-navigation';
import { authStore, resetAuthStore } from '@/store/auth-store';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const LIVE_BASE_URL = process.env.LIVE_API_BASE_URL?.trim() ?? '';
const DEFAULT_REGISTER_PASSWORD = 'LiveMobAuth1!';
const DEFAULT_EXISTING_NAME = 'Live Mob Auth';

interface RecordedExchange {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  status: number;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
}

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

const normalizeHeaders = (
  headers: Headers | HeadersInit | undefined,
): Record<string, string> => {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return {
    ...headers,
  };
};

const parseResponseBody = async (response: Response): Promise<unknown> => {
  const text = await response.clone().text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const getHeaderValue = (headers: Record<string, string>, key: string) =>
  headers[key]
  ?? headers[key.toLowerCase()]
  ?? Object.entries(headers).find(([candidate]) => candidate.toLowerCase() === key.toLowerCase())?.[1];

const splitHeaderValues = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((candidate) => candidate.trim())
    .filter(Boolean);

const getPathname = (url: string) => new URL(url).pathname;

const findExchange = (
  exchanges: RecordedExchange[],
  pathname: string,
  method: string,
) =>
  [...exchanges]
    .reverse()
    .find(
      (exchange) =>
        exchange.method === method
        && getPathname(exchange.url) === pathname,
    );

const createCookieAwareFetch = (
  baseUrl: string,
  cookieManager: LiveCookieManager,
  exchanges: RecordedExchange[],
) => {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    const cookieHeader = await cookieManager.cookieHeader(baseUrl);

    if (cookieHeader) {
      headers.set('Cookie', cookieHeader);
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });

    exchanges.push({
      url,
      method,
      requestHeaders: normalizeHeaders(headers),
      status: response.status,
      responseHeaders: normalizeHeaders(response.headers),
      responseBody: await parseResponseBody(response),
    });

    for (const setCookie of readSetCookieHeaders(response.headers)) {
      cookieManager.rememberSetCookie(baseUrl, setCookie);
    }

    return response;
  };
};

const createLiveIdentity = () => {
  const configuredEmail = process.env.LIVE_EMAIL?.trim() ?? '';
  const configuredPassword =
    process.env.LIVE_PASSWORD?.trim()
    ?? process.env.LIVE_REGISTER_PASSWORD?.trim()
    ?? '';
  const configuredName = process.env.LIVE_NAME?.trim() ?? DEFAULT_EXISTING_NAME;

  if (configuredEmail && configuredPassword) {
    return {
      email: configuredEmail,
      name: configuredName,
      password: configuredPassword,
      reuseExistingAccount: true,
    };
  }

  const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  return {
    email: `mob_auth_live_${suffix}@example.com`,
    name: `Mob Auth ${suffix}`,
    password: process.env.LIVE_REGISTER_PASSWORD ?? DEFAULT_REGISTER_PASSWORD,
    reuseExistingAccount: false,
  };
};

const createLiveHarness = (baseUrl: string) => {
  const cookieManager = new LiveCookieManager();
  const exchanges: RecordedExchange[] = [];
  const fetchFn = createCookieAwareFetch(baseUrl, cookieManager, exchanges);
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
    exchanges,
    viewModel,
  };
};

describe.runIf(Boolean(LIVE_BASE_URL))('Live mobile auth against backend', () => {
  beforeAll(() => {
    authStore.initialize(null);
  });

  beforeEach(() => {
    resetAuthStore();
  });

  afterAll(() => {
    resetAuthStore();
  });

  it('normalizes the real backend invalid-credentials error contract and preserves backend correlation metadata', async () => {
    const identity = createLiveIdentity();

    if (!identity.reuseExistingAccount) {
      const registrationHarness = createLiveHarness(LIVE_BASE_URL);

      const registerResult = await registrationHarness.viewModel.submitRegister({
        email: identity.email,
        name: identity.name,
        password: identity.password,
      });

      expect(registerResult).toEqual({
        success: true,
      });
      expect(registrationHarness.viewModel.getState().pendingMfa).toMatchObject({
        source: 'register',
        email: identity.email,
      });
    }

    resetAuthStore();

    const loginHarness = createLiveHarness(LIVE_BASE_URL);
    const loginResult = await loginHarness.viewModel.submitLogin({
      email: identity.email,
      password: process.env.LIVE_INVALID_PASSWORD?.trim() ?? `${identity.password}-wrong`,
    });

    expect(loginResult).toMatchObject({
      success: false,
    });

    if (loginResult.success) {
      throw new Error('Expected invalid-credentials login to fail.');
    }

    const loginExchange = findExchange(
      loginHarness.exchanges,
      '/api/v1/auth/login',
      'POST',
    );

    expect(loginExchange).toBeDefined();
    expect(loginExchange).toMatchObject({
      status: 401,
      responseBody: {
        code: 'AUTH_001',
        message: 'invalid credentials',
        path: '/api/v1/auth/login',
        correlationId: expect.any(String),
      },
    });

    const backendCorrelationId = getHeaderValue(
      loginExchange!.responseHeaders,
      'X-Correlation-Id',
    );
    const responseBodyCorrelationId = (
      loginExchange!.responseBody as { correlationId?: string }
    ).correlationId;

    expect(backendCorrelationId).toBeTruthy();
    expect(responseBodyCorrelationId).toBeTruthy();
    expect(splitHeaderValues(backendCorrelationId)).toContain(responseBodyCorrelationId!);
    expect(loginResult.error).toMatchObject({
      code: 'AUTH_001',
      status: 401,
      detail: '/api/v1/auth/login',
      traceId: responseBodyCorrelationId,
    });
    expect(resolveAuthErrorPresentation(loginResult.error)).toMatchObject({
      semantic: 'invalid-credentials',
      recoveryAction: 'retry-credentials',
      traceId: responseBodyCorrelationId,
    });
    expect(getLoginErrorFeedback(loginResult.error)).toMatchObject({
      globalMessage: '이메일 또는 비밀번호가 올바르지 않습니다.',
      fieldMessages: {},
    });
  }, 90_000);
});
