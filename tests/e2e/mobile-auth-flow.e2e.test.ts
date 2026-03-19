import { createAuthApi } from '@/api/auth-api';
import {
  getLoginErrorFeedback,
  getRegisterErrorFeedback,
  resolveAuthErrorPresentation,
  resolveMfaErrorPresentation,
} from '@/auth/auth-errors';
import { createAuthFlowViewModel } from '@/auth/auth-flow-view-model';
import { createMobileAuthService } from '@/auth/mobile-auth-service';
import { InMemoryCookieManager } from '@/network/cookie-manager';
import { CsrfTokenManager } from '@/network/csrf';
import { HttpClient } from '@/network/http-client';
import {
  createAuthNavigationState,
  enterAuthenticatedApp,
} from '@/navigation/auth-navigation';
import { authStore, resetAuthStore } from '@/store/auth-store';
import type { Member } from '@/types/auth';

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

const jsonResponse = (
  status: number,
  body: unknown,
  headers?: HeadersInit,
): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...(headers ?? {}),
    },
  });

const successResponse = <T,>(status: number, data: T): Response =>
  jsonResponse(status, {
    success: true,
    data,
    error: null,
  });

const errorResponse = (
  status: number,
  code: string,
  message: string,
  path: string,
  options?: {
    correlationId?: string;
    retryAfterSeconds?: number;
    enrollUrl?: string;
    operatorCode?: string;
    recoveryUrl?: string;
    headers?: HeadersInit;
  },
): Response =>
  jsonResponse(
    status,
    {
      code,
      message,
      path,
      correlationId: options?.correlationId,
      operatorCode: options?.operatorCode,
      retryAfterSeconds: options?.retryAfterSeconds,
      enrollUrl: options?.enrollUrl,
      recoveryUrl: options?.recoveryUrl,
      timestamp: '2026-03-08T00:00:00.000Z',
    },
    options?.headers,
  );

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

const findCall = (
  calls: RecordedCall[],
  pathname: string,
  method: string,
): RecordedCall | undefined =>
  calls.find(
    (call) => call.method === method && getPathname(call.url) === pathname,
  );

const getFormBody = (body: string | undefined) =>
  Object.fromEntries(new URLSearchParams(body ?? '').entries());

const readCsrfToken = (payload: { csrfToken?: string; token?: string }) =>
  payload.csrfToken ?? payload.token ?? '';

const memberFixture: Member = {
  memberUuid: 'member-001',
  email: 'demo@fix.com',
  name: 'Demo User',
  role: 'ROLE_USER',
  totpEnrolled: false,
};

const createHarness = (
  handler: (request: RecordedCall) => Promise<Response> | Response,
  options?: {
    authenticated?: boolean;
    initialAppState?: 'active' | 'background' | 'inactive';
  },
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
      cookieManager.setCookie(baseUrl, 'XSRF-TOKEN', readCsrfToken(response.body));
    },
  });

  const client = new HttpClient({
    baseUrl,
    fetchFn: fetchMock as unknown as typeof fetch,
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
      strictCsrfBootstrap: false,
    },
  });
  const viewModel = createAuthFlowViewModel({
    authService,
    authStore,
    initialAppState: options?.initialAppState,
    initialNavigationState: options?.authenticated
      ? enterAuthenticatedApp(createAuthNavigationState(), {
          source: 'login',
        })
      : createAuthNavigationState(),
  });

  return {
    baseUrl,
    calls,
    cookieManager,
    viewModel,
    getNavigationState: () => viewModel.getState().navigationState,
    setAuthenticatedState: () => {
      authStore.login(memberFixture);
    },
  };
};

const notFoundResponse = (request: RecordedCall): Response =>
  errorResponse(
    404,
    'SYS-404',
    `Unhandled request: ${request.method} ${getPathname(request.url)}`,
    getPathname(request.url),
  );

describe('Backend-driven mobile auth workflow contract tests', () => {
  beforeEach(() => {
    resetAuthStore();
  });

  it('completes the MFA login workflow, refreshes csrf state, and enters the authenticated stack', async () => {
    let csrfTokenVersion = 0;

    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        csrfTokenVersion += 1;

        return successResponse(200, {
          token: `csrf-login-${csrfTokenVersion}`,
        });
      }

      if (request.method === 'POST' && getPathname(request.url) === '/api/v1/auth/login') {
        return successResponse(200, {
          loginToken: 'login-token',
          nextAction: 'VERIFY_TOTP',
          totpEnrolled: true,
          expiresAt: '2026-03-12T10:00:00Z',
        });
      }

      if (request.method === 'POST' && getPathname(request.url) === '/api/v1/auth/otp/verify') {
        return successResponse(200, {
          memberId: 1,
          email: 'demo@fix.com',
          name: 'Demo User',
          totpEnrolled: true,
        });
      }

      return notFoundResponse(request);
    });

    authStore.initialize(null);

    const passwordStep = await harness.viewModel.submitLogin({
      email: 'demo@fix.com',
      password: 'Test1234!',
    });

    expect(passwordStep).toEqual({
      success: true,
    });
    expect(harness.getNavigationState()).toMatchObject({
      stack: 'auth',
      authRoute: 'login',
    });

    const mfaStep = await harness.viewModel.submitLoginMfa({
      loginToken: 'login-token',
      otpCode: '123456',
    });

    expect(mfaStep).toEqual({
      success: true,
    });
    expect(authStore.getState()).toMatchObject({
      status: 'authenticated',
      member: {
        memberUuid: '1',
        email: 'demo@fix.com',
        name: 'Demo User',
        role: 'ROLE_USER',
        totpEnrolled: true,
      },
    });
    expect(harness.getNavigationState()).toMatchObject({
      stack: 'app',
      welcomeVariant: 'login',
    });

    const loginCall = findCall(harness.calls, '/api/v1/auth/login', 'POST');
    const verifyCall = findCall(harness.calls, '/api/v1/auth/otp/verify', 'POST');

    expect(loginCall?.headers['X-XSRF-TOKEN']).toBe('csrf-login-1');
    expect(verifyCall?.headers['X-XSRF-TOKEN']).toBe('csrf-login-1');
    expect(getFormBody(loginCall?.body)).toEqual({
      email: 'demo@fix.com',
      password: 'Test1234!',
    });
    expect(verifyCall?.body).toBe(JSON.stringify({
      loginToken: 'login-token',
      otpCode: '123456',
    }));
    expect(
      harness.calls.filter((call) => getPathname(call.url) === '/api/v1/auth/csrf'),
    ).toHaveLength(2);

    await expect(harness.cookieManager.get(harness.baseUrl)).resolves.toMatchObject({
      'XSRF-TOKEN': {
        value: 'csrf-login-2',
      },
    });
  });

  it('registers, enrolls TOTP, and preserves the register welcome state', async () => {
    let csrfTokenVersion = 0;

    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        csrfTokenVersion += 1;

        return successResponse(200, {
          token: `csrf-register-${csrfTokenVersion}`,
        });
      }

      if (request.method === 'POST' && getPathname(request.url) === '/api/v1/auth/register') {
        return successResponse(200, {
          memberId: 2,
          email: 'new@fix.com',
          name: 'New User',
        });
      }

      if (request.method === 'POST' && getPathname(request.url) === '/api/v1/auth/login') {
        return successResponse(200, {
          loginToken: 'register-login-token',
          nextAction: 'ENROLL_TOTP',
          totpEnrolled: false,
          expiresAt: '2026-03-12T10:05:00Z',
        });
      }

      if (
        request.method === 'POST' &&
        getPathname(request.url) === '/api/v1/members/me/totp/enroll'
      ) {
        return successResponse(200, {
          qrUri: 'otpauth://totp/FIX:new@fix.com?secret=NEW123',
          manualEntryKey: 'NEW123',
          enrollmentToken: 'enrollment-token',
          expiresAt: '2026-03-12T10:08:00Z',
        });
      }

      if (
        request.method === 'POST' &&
        getPathname(request.url) === '/api/v1/members/me/totp/confirm'
      ) {
        return successResponse(200, {
          memberId: 2,
          email: 'new@fix.com',
          name: 'New User',
          totpEnrolled: true,
        });
      }

      return notFoundResponse(request);
    });

    authStore.initialize(null);

    const registerResult = await harness.viewModel.submitRegister({
      email: 'new@fix.com',
      name: 'New User',
      password: 'Test1234!',
    });

    expect(registerResult).toEqual({
      success: true,
    });
    expect(harness.getNavigationState()).toMatchObject({
      stack: 'auth',
      authRoute: 'totpEnroll',
    });

    const enrollmentBootstrap = await harness.viewModel.loadTotpEnrollment();

    expect(enrollmentBootstrap).toEqual({
      success: true,
      enrollment: {
        qrUri: 'otpauth://totp/FIX:new@fix.com?secret=NEW123',
        manualEntryKey: 'NEW123',
        enrollmentToken: 'enrollment-token',
        expiresAt: '2026-03-12T10:08:00Z',
      },
    });

    const confirmResult = await harness.viewModel.submitTotpEnrollmentConfirmation({
      loginToken: 'register-login-token',
      enrollmentToken: 'enrollment-token',
      otpCode: '123456',
    });

    expect(confirmResult).toEqual({
      success: true,
    });
    expect(authStore.getState()).toMatchObject({
      status: 'authenticated',
      member: {
        memberUuid: '2',
        email: 'new@fix.com',
        name: 'New User',
        role: 'ROLE_USER',
        totpEnrolled: true,
      },
    });
    expect(harness.getNavigationState()).toMatchObject({
      stack: 'app',
      welcomeVariant: 'register',
    });

    const registerCall = findCall(harness.calls, '/api/v1/auth/register', 'POST');
    const loginCall = findCall(harness.calls, '/api/v1/auth/login', 'POST');
    const enrollCall = findCall(harness.calls, '/api/v1/members/me/totp/enroll', 'POST');
    const confirmCall = findCall(harness.calls, '/api/v1/members/me/totp/confirm', 'POST');

    expect(registerCall?.headers['X-XSRF-TOKEN']).toBe('csrf-register-1');
    expect(loginCall?.headers['X-XSRF-TOKEN']).toBe('csrf-register-1');
    expect(enrollCall?.headers['X-XSRF-TOKEN']).toBe('csrf-register-1');
    expect(confirmCall?.headers['X-XSRF-TOKEN']).toBe('csrf-register-1');
    expect(getFormBody(registerCall?.body)).toEqual({
      email: 'new@fix.com',
      name: 'New User',
      password: 'Test1234!',
    });
  });

  it('maps invalid password-step responses to the standardized global auth copy', async () => {
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: 'csrf-invalid-login',
        });
      }

      if (request.method === 'POST' && getPathname(request.url) === '/api/v1/auth/login') {
        return errorResponse(
          401,
          'AUTH-001',
          'Credential mismatch',
          '/api/v1/auth/login',
          {
            correlationId: 'corr-auth-invalid-001',
          },
        );
      }

      return notFoundResponse(request);
    });

    authStore.initialize(null);

    const result = await harness.viewModel.submitLogin({
      email: 'demo@fix.com',
      password: 'wrong-password',
    });

    expect(result).toMatchObject({
      success: false,
    });
    expect(
      getLoginErrorFeedback((result as Extract<typeof result, { success: false }>).error),
    ).toMatchObject({
      globalMessage: '이메일 또는 비밀번호가 올바르지 않습니다.',
    });
    expect(
      resolveAuthErrorPresentation(
        (result as Extract<typeof result, { success: false }>).error,
      ),
    ).toMatchObject({
      semantic: 'invalid-credentials',
      traceId: 'corr-auth-invalid-001',
    });
    expect(authStore.getState()).toMatchObject({
      status: 'anonymous',
      member: null,
    });
  });

  it('redirects MFA verification failures that require enrollment into the enrollment route', async () => {
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: 'csrf-auth-009',
        });
      }

      if (request.method === 'POST' && getPathname(request.url) === '/api/v1/auth/login') {
        return successResponse(200, {
          loginToken: 'login-token',
          nextAction: 'VERIFY_TOTP',
          totpEnrolled: true,
          expiresAt: '2026-03-12T10:00:00Z',
        });
      }

      if (request.method === 'POST' && getPathname(request.url) === '/api/v1/auth/otp/verify') {
        return errorResponse(
          403,
          'AUTH-009',
          'TOTP enrollment required',
          '/api/v1/auth/otp/verify',
          {
            enrollUrl: '/settings/totp/enroll',
          },
        );
      }

      return notFoundResponse(request);
    });

    authStore.initialize(null);

    await harness.viewModel.submitLogin({
      email: 'demo@fix.com',
      password: 'Test1234!',
    });

    const result = await harness.viewModel.submitLoginMfa({
      loginToken: 'login-token',
      otpCode: '123456',
    });

    expect(result).toEqual({
      success: true,
    });
    expect(harness.getNavigationState()).toMatchObject({
      stack: 'auth',
      authRoute: 'totpEnroll',
    });
    expect(harness.viewModel.getState().pendingMfa).toMatchObject({
      loginToken: 'login-token',
      nextAction: 'ENROLL_TOTP',
    });
  });

  it('keeps the MFA login step active and exposes throttle guidance when otp verification is rate limited', async () => {
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: 'csrf-rate-limit',
        });
      }

      if (request.method === 'POST' && getPathname(request.url) === '/api/v1/auth/login') {
        return successResponse(200, {
          loginToken: 'login-token',
          nextAction: 'VERIFY_TOTP',
          totpEnrolled: true,
          expiresAt: '2026-03-12T10:00:00Z',
        });
      }

      if (request.method === 'POST' && getPathname(request.url) === '/api/v1/auth/otp/verify') {
        return errorResponse(
          429,
          'RATE-001',
          'Too many attempts',
          '/api/v1/auth/otp/verify',
          {
            retryAfterSeconds: 30,
          },
        );
      }

      return notFoundResponse(request);
    });

    authStore.initialize(null);

    await harness.viewModel.submitLogin({
      email: 'demo@fix.com',
      password: 'Test1234!',
    });

    const result = await harness.viewModel.submitLoginMfa({
      loginToken: 'login-token',
      otpCode: '123456',
    });

    expect(result).toMatchObject({
      success: false,
    });
    expect(
      resolveMfaErrorPresentation((result as Extract<typeof result, { success: false }>).error),
    ).toMatchObject({
      code: 'RATE-001',
      message: '인증 시도가 너무 많습니다. 30초 후 다시 시도해 주세요.',
      restartLogin: false,
      navigateToEnroll: false,
    });
    expect(harness.getNavigationState()).toMatchObject({
      stack: 'auth',
      authRoute: 'login',
    });
    expect(harness.viewModel.getState().pendingMfa).toMatchObject({
      loginToken: 'login-token',
      nextAction: 'VERIFY_TOTP',
    });
    expect(findCall(harness.calls, '/api/v1/auth/otp/verify', 'POST')?.body).toBe(
      JSON.stringify({
        loginToken: 'login-token',
        otpCode: '123456',
      }),
    );
  });

  it('maps duplicate-email registration failures to the email field', async () => {
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: 'csrf-register-email-error',
        });
      }

      if (request.method === 'POST' && getPathname(request.url) === '/api/v1/auth/register') {
        return errorResponse(
          409,
          'AUTH-017',
          'Email already exists',
          '/api/v1/auth/register',
        );
      }

      return notFoundResponse(request);
    });

    authStore.initialize(null);

    const result = await harness.viewModel.submitRegister({
      email: 'new@fix.com',
      name: 'New User',
      password: 'Test1234!',
    });

    expect(result).toMatchObject({
      success: false,
    });
    expect(
      getRegisterErrorFeedback(
        (result as Extract<typeof result, { success: false }>).error,
      ),
    ).toMatchObject({
      fieldErrors: {
        email: true,
      },
      fieldMessages: {
        email: '이미 가입된 이메일입니다. 다른 이메일을 입력해 주세요.',
      },
    });
    expect(findCall(harness.calls, '/api/v1/auth/login', 'POST')).toBeUndefined();
  });

  it('maps unknown password-step failures to the safe fallback with a visible correlation id', async () => {
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: 'csrf-auth-unknown',
        });
      }

      if (request.method === 'POST' && getPathname(request.url) === '/api/v1/auth/login') {
        return errorResponse(
          500,
          'AUTH-999',
          'Raw backend details should not leak',
          '/api/v1/auth/login',
          {
            correlationId: 'corr-body-123',
          },
        );
      }

      return notFoundResponse(request);
    });

    authStore.initialize(null);

    const result = await harness.viewModel.submitLogin({
      email: 'demo@fix.com',
      password: 'wrong-password',
    });

    expect(result).toMatchObject({
      success: false,
    });
    expect(
      getLoginErrorFeedback((result as Extract<typeof result, { success: false }>).error),
    ).toMatchObject({
      globalMessage:
        '로그인을 완료할 수 없습니다. 잠시 후 다시 시도해 주세요. 문제가 계속되면 고객센터에 문의해 주세요. 문의 코드: corr-body-123',
    });
    expect(
      resolveAuthErrorPresentation(
        (result as Extract<typeof result, { success: false }>).error,
      ),
    ).toMatchObject({
      semantic: 'unknown',
      traceId: 'corr-body-123',
    });
  });

  it('maps unknown password-step failures to the safe fallback when correlation only arrives in the response header', async () => {
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: 'csrf-auth-unknown-header',
        });
      }

      if (request.method === 'POST' && getPathname(request.url) === '/api/v1/auth/login') {
        return errorResponse(
          500,
          'AUTH-999',
          'Raw backend details should not leak',
          '/api/v1/auth/login',
          {
            headers: {
              'X-Correlation-Id': 'corr-header-123',
            },
          },
        );
      }

      return notFoundResponse(request);
    });

    authStore.initialize(null);

    const result = await harness.viewModel.submitLogin({
      email: 'demo@fix.com',
      password: 'wrong-password',
    });

    expect(result).toMatchObject({
      success: false,
    });
    expect(
      getLoginErrorFeedback((result as Extract<typeof result, { success: false }>).error),
    ).toMatchObject({
      globalMessage:
        '로그인을 완료할 수 없습니다. 잠시 후 다시 시도해 주세요. 문제가 계속되면 고객센터에 문의해 주세요. 문의 코드: corr-header-123',
    });
    expect(
      resolveAuthErrorPresentation(
        (result as Extract<typeof result, { success: false }>).error,
      ),
    ).toMatchObject({
      semantic: 'unknown',
      traceId: 'corr-header-123',
    });
    expect((result as Extract<typeof result, { success: false }>).error).toMatchObject({
      code: 'AUTH-999',
      status: 500,
      traceId: 'corr-header-123',
    });
  });

  it('revalidates on app resume and routes stale sessions back to login safely', async () => {
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: 'csrf-resume-1',
        });
      }

      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/session') {
        return errorResponse(
          401,
          'AUTH-003',
          'Authentication required',
          '/api/v1/auth/session',
        );
      }

      return notFoundResponse(request);
    }, {
      authenticated: true,
    });

    harness.setAuthenticatedState();

    const result = await harness.viewModel.refreshProtectedSession('resume');

    expect(result).toMatchObject({
      status: 'reauth',
    });
    expect(authStore.getState()).toMatchObject({
      status: 'anonymous',
      member: null,
      reauthMessage: '세션이 만료되었습니다. 다시 로그인해 주세요.',
    });
    expect(harness.getNavigationState()).toMatchObject({
      stack: 'auth',
      authRoute: 'login',
      pendingProtectedRoute: 'portfolio',
    });
    expect(
      harness.calls.map((call) => `${call.method} ${getPathname(call.url)}`),
    ).toEqual([
      'GET /api/v1/auth/csrf',
      'GET /api/v1/auth/session',
    ]);
  });

  it('routes protected-session failures to deterministic re-auth navigation', async () => {
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/session') {
        return errorResponse(
          401,
          'AUTH-003',
          'Authentication required',
          '/api/v1/auth/session',
        );
      }

      return notFoundResponse(request);
    }, {
      authenticated: true,
    });

    harness.setAuthenticatedState();

    const result = await harness.viewModel.refreshProtectedSession();

    expect(result).toMatchObject({
      status: 'reauth',
    });
    expect(authStore.getState()).toMatchObject({
      status: 'anonymous',
      member: null,
      reauthMessage: '세션이 만료되었습니다. 다시 로그인해 주세요.',
    });
    expect(harness.getNavigationState()).toMatchObject({
      stack: 'auth',
      authRoute: 'login',
      pendingProtectedRoute: 'portfolio',
    });
  });
});
