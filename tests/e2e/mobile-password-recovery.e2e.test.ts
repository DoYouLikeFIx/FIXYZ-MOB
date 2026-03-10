import { createAuthApi } from '@/api/auth-api';
import { createAuthFlowViewModel } from '@/auth/auth-flow-view-model';
import { createMobileAuthService } from '@/auth/mobile-auth-service';
import { InMemoryCookieManager } from '@/network/cookie-manager';
import { CsrfTokenManager } from '@/network/csrf';
import { DEFAULT_SERVER_ERROR_MESSAGE } from '@/network/errors';
import { HttpClient } from '@/network/http-client';
import { createAuthNavigationState } from '@/navigation/auth-navigation';
import { authStore, resetAuthStore } from '@/store/auth-store';

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

const jsonResponse = (status: number, body: unknown, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
  });

const successResponse = <T,>(status: number, data: T, headers?: Record<string, string>) =>
  jsonResponse(status, {
    success: true,
    data,
    error: null,
  }, headers);

const errorResponse = (
  status: number,
  code: string,
  message: string,
  detail: string,
  headers?: Record<string, string>,
) =>
  jsonResponse(status, {
    success: false,
    data: null,
    error: {
      code,
      message,
      detail,
      timestamp: '2026-03-10T00:00:00.000Z',
    },
  }, headers);

const normalizeHeaders = (headers: HeadersInit | undefined): Record<string, string> => {
  if (!headers) {
    return {};
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  return {
    ...headers,
  };
};

const getPathname = (url: string) => new URL(url).pathname;

const createHarness = (
  handler: (request: RecordedCall) => Promise<Response> | Response,
) => {
  const baseUrl = 'http://localhost:8080';
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const request: RecordedCall = {
        url: String(input),
        method: (init?.method ?? 'GET').toUpperCase(),
        headers: normalizeHeaders(init?.headers),
        body: typeof init?.body === 'string' ? init.body : undefined,
      };

      calls.push(request);
      return handler(request);
    },
  );
  const cookieManager = new InMemoryCookieManager();
  const bootstrapClient = new HttpClient({
    baseUrl,
    fetchFn: fetchMock as unknown as typeof fetch,
  });
  const csrfManager = new CsrfTokenManager({
    baseUrl,
    cookieManager,
    bootstrapCsrf: async () => {
      const response = await bootstrapClient.get<{ csrfToken?: string; token?: string }>(
        '/api/v1/auth/csrf',
      );
      const token = response.body.csrfToken ?? response.body.token ?? '';
      cookieManager.setCookie(baseUrl, 'XSRF-TOKEN', token);
      return response.body;
    },
  });
  const client = new HttpClient({
    baseUrl,
    fetchFn: fetchMock as unknown as typeof fetch,
    csrfManager,
  });
  const authApi = createAuthApi({ client, csrfManager });
  const authService = createMobileAuthService({
    authApi,
    csrfManager,
  });
  const viewModel = createAuthFlowViewModel({
    authService,
    authStore,
    initialNavigationState: createAuthNavigationState(),
  });

  return {
    calls,
    viewModel,
  };
};

describe('E2E tests: mobile password recovery workflow', () => {
  beforeEach(() => {
    resetAuthStore();
  });

  it('bootstraps a challenge and preserves the forgot-password email on the follow-up submit', async () => {
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: 'csrf-forgot',
        });
      }

      if (
        request.method === 'POST'
        && getPathname(request.url) === '/api/v1/auth/password/forgot/challenge'
      ) {
        return successResponse(200, {
          challengeToken: 'challenge-token',
          challengeType: 'captcha',
          challengeTtlSeconds: 300,
        });
      }

      if (
        request.method === 'POST'
        && getPathname(request.url) === '/api/v1/auth/password/forgot'
      ) {
        return successResponse(202, {
          accepted: true,
          message: 'If the account is eligible, a reset email will be sent.',
          recovery: {
            challengeEndpoint: '/api/v1/auth/password/forgot/challenge',
            challengeMayBeRequired: true,
          },
        });
      }

      return errorResponse(404, 'SYS-404', 'Unhandled request', 'Missing route');
    });

    const challengeResult = await harness.viewModel.submitPasswordRecoveryChallenge({
      email: 'demo@fix.com',
    });
    const forgotResult = await harness.viewModel.submitPasswordResetEmail({
      email: 'demo@fix.com',
      challengeToken: 'challenge-token',
      challengeAnswer: 'ready',
    });

    expect(challengeResult).toMatchObject({
      success: true,
      challenge: {
        challengeType: 'captcha',
      },
    });
    expect(forgotResult).toMatchObject({
      success: true,
      response: {
        accepted: true,
      },
    });
    expect(
      harness.calls.find((call) => getPathname(call.url) === '/api/v1/auth/password/forgot'),
    ).toMatchObject({
      method: 'POST',
    });
  });

  it('fails forgot-password deterministically after a second csrf 403', async () => {
    let forgotAttempts = 0;
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: `csrf-forgot-${forgotAttempts + 1}`,
        });
      }

      if (
        request.method === 'POST'
        && getPathname(request.url) === '/api/v1/auth/password/forgot'
      ) {
        forgotAttempts += 1;

        return new Response('Forbidden', {
          status: 403,
          headers: {
            'Content-Type': 'text/plain',
          },
        });
      }

      return errorResponse(404, 'SYS-404', 'Unhandled request', 'Missing route');
    });

    const result = await harness.viewModel.submitPasswordResetEmail({
      email: 'demo@fix.com',
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        status: 403,
        message: DEFAULT_SERVER_ERROR_MESSAGE,
      }),
    });
    expect(
      harness.calls.filter((call) => getPathname(call.url) === '/api/v1/auth/password/forgot'),
    ).toHaveLength(2);
    expect(
      harness.calls.filter((call) => getPathname(call.url) === '/api/v1/auth/csrf'),
    ).toHaveLength(2);
  });

  it('fails challenge bootstrap deterministically after a second csrf 403', async () => {
    let challengeAttempts = 0;
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: `csrf-challenge-${challengeAttempts + 1}`,
        });
      }

      if (
        request.method === 'POST'
        && getPathname(request.url) === '/api/v1/auth/password/forgot/challenge'
      ) {
        challengeAttempts += 1;

        return new Response('Forbidden', {
          status: 403,
          headers: {
            'Content-Type': 'text/plain',
          },
        });
      }

      return errorResponse(404, 'SYS-404', 'Unhandled request', 'Missing route');
    });

    const result = await harness.viewModel.submitPasswordRecoveryChallenge({
      email: 'demo@fix.com',
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        status: 403,
        message: DEFAULT_SERVER_ERROR_MESSAGE,
      }),
    });
    expect(
      harness.calls.filter((call) => getPathname(call.url) === '/api/v1/auth/password/forgot/challenge'),
    ).toHaveLength(2);
    expect(
      harness.calls.filter((call) => getPathname(call.url) === '/api/v1/auth/csrf'),
    ).toHaveLength(2);
  });

  it('retries password reset exactly once after a csrf 403 and returns to login with success guidance', async () => {
    let resetAttempts = 0;
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: `csrf-reset-${resetAttempts + 1}`,
        });
      }

      if (
        request.method === 'POST'
        && getPathname(request.url) === '/api/v1/auth/password/reset'
      ) {
        resetAttempts += 1;

        if (resetAttempts === 1) {
          return jsonResponse(403, {
            status: 403,
            error: 'Forbidden',
            message: 'Forbidden',
          });
        }

        return new Response(null, {
          status: 204,
        });
      }

      return errorResponse(404, 'SYS-404', 'Unhandled request', 'Missing route');
    });

    const result = await harness.viewModel.submitPasswordReset({
      token: 'reset-token',
      newPassword: 'Test1234!',
    });

    expect(result).toEqual({
      success: true,
    });
    expect(
      harness.calls.filter((call) => getPathname(call.url) === '/api/v1/auth/password/reset'),
    ).toHaveLength(2);
    expect(harness.viewModel.getState()).toMatchObject({
      authBannerMessage: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.',
      navigationState: {
        authRoute: 'login',
      },
    });
  });

  it('fails reset deterministically after a second csrf 403 and keeps the reset route active', async () => {
    let resetAttempts = 0;
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: `csrf-reset-${resetAttempts + 1}`,
        });
      }

      if (
        request.method === 'POST'
        && getPathname(request.url) === '/api/v1/auth/password/reset'
      ) {
        resetAttempts += 1;

        return new Response('Forbidden', {
          status: 403,
          headers: {
            'Content-Type': 'text/plain',
          },
        });
      }

      return errorResponse(404, 'SYS-404', 'Unhandled request', 'Missing route');
    });

    harness.viewModel.ingestPasswordResetToken('reset-token');

    const result = await harness.viewModel.submitPasswordReset({
      token: 'reset-token',
      newPassword: 'Test1234!',
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        status: 403,
        message: DEFAULT_SERVER_ERROR_MESSAGE,
      }),
    });
    expect(
      harness.calls.filter((call) => getPathname(call.url) === '/api/v1/auth/password/reset'),
    ).toHaveLength(2);
    expect(harness.viewModel.getState()).toMatchObject({
      authBannerMessage: null,
      navigationState: {
        authRoute: 'resetPassword',
        resetPasswordToken: 'reset-token',
      },
    });
  });

  it('preserves the reset route and returns AUTH-012 when the backend rejects an invalid token', async () => {
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: 'csrf-reset-invalid',
        });
      }

      if (
        request.method === 'POST'
        && getPathname(request.url) === '/api/v1/auth/password/reset'
      ) {
        return errorResponse(
          401,
          'AUTH-012',
          'reset token invalid or expired',
          'The supplied token is invalid or expired.',
        );
      }

      return errorResponse(404, 'SYS-404', 'Unhandled request', 'Missing route');
    });

    harness.viewModel.openResetPassword();

    const result = await harness.viewModel.submitPasswordReset({
      token: 'invalid-reset-token',
      newPassword: 'Test1234!',
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        code: 'AUTH-012',
        status: 401,
      }),
    });
    expect(
      harness.calls.filter((call) => getPathname(call.url) === '/api/v1/auth/password/reset'),
    ).toHaveLength(1);
    expect(harness.viewModel.getState()).toMatchObject({
      authBannerMessage: null,
      navigationState: {
        authRoute: 'resetPassword',
      },
    });
  });

  it('routes reset AUTH-016 failures back to login with deterministic reauth guidance', async () => {
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: 'csrf-reset-reauth',
        });
      }

      if (
        request.method === 'POST'
        && getPathname(request.url) === '/api/v1/auth/password/reset'
      ) {
        return errorResponse(
          401,
          'AUTH-016',
          'Session invalidated by another login',
          'The recovery flow must restart from login.',
        );
      }

      return errorResponse(404, 'SYS-404', 'Unhandled request', 'Missing route');
    });

    harness.viewModel.ingestPasswordResetToken('handoff-token');

    const result = await harness.viewModel.submitPasswordReset({
      token: 'handoff-token',
      newPassword: 'Test1234!',
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        code: 'AUTH-016',
        status: 401,
      }),
    });
    expect(authStore.getState().reauthMessage).toBe('세션이 만료되었습니다. 다시 로그인해 주세요.');
    expect(harness.viewModel.getState()).toMatchObject({
      navigationState: {
        authRoute: 'login',
        resetPasswordToken: null,
      },
    });
  });
});
