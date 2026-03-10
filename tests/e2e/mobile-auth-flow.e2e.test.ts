import { createAuthApi } from '@/api/auth-api';
import {
  getLoginErrorFeedback,
  getRegisterErrorFeedback,
  resolveAuthErrorPresentation,
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

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
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
  detail: string,
  options?: {
    traceId?: string;
  },
): Response =>
  jsonResponse(status, {
    success: false,
    data: null,
    traceId: options?.traceId,
    error: {
      code,
      message,
      detail,
      timestamp: '2026-03-08T00:00:00.000Z',
    },
  });

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
    'Test harness request handler is missing a route',
  );

describe('E2E tests: mobile auth workflow', () => {
  beforeEach(() => {
    resetAuthStore();
  });

  it('logs in through the mobile auth workflow, refreshes csrf state, and enters the authenticated stack', async () => {
    let csrfTokenVersion = 0;

    const harness = createHarness((request) => {
      if (
        request.method === 'GET' &&
        getPathname(request.url) === '/api/v1/auth/csrf'
      ) {
        csrfTokenVersion += 1;

        return successResponse(200, {
          token: `csrf-login-${csrfTokenVersion}`,
        });
      }

      if (
        request.method === 'POST' &&
        getPathname(request.url) === '/api/v1/auth/login'
      ) {
        return successResponse(200, {
          memberId: 1,
          email: 'demo@fix.com',
          name: 'Demo User',
        });
      }

      if (
        request.method === 'GET' &&
        getPathname(request.url) === '/api/v1/auth/session'
      ) {
        return successResponse(200, memberFixture);
      }

      return notFoundResponse(request);
    });

    authStore.initialize(null);

    const result = await harness.viewModel.submitLogin({
      email: 'demo@fix.com',
      password: 'Test1234!',
    });

    expect(result).toEqual({
      success: true,
      member: memberFixture,
    });
    expect(authStore.getState()).toMatchObject({
      status: 'authenticated',
      member: memberFixture,
    });
    expect(harness.getNavigationState()).toMatchObject({
      stack: 'app',
      welcomeVariant: 'login',
    });

    const loginCall = findCall(harness.calls, '/api/v1/auth/login', 'POST');
    expect(loginCall?.headers['X-XSRF-TOKEN']).toBe('csrf-login-1');
    expect(
      harness.calls.filter(
        (call) => getPathname(call.url) === '/api/v1/auth/csrf',
      ),
    ).toHaveLength(2);
    expect(getFormBody(loginCall?.body)).toEqual({
      email: 'demo@fix.com',
      password: 'Test1234!',
    });

    await expect(harness.cookieManager.get(harness.baseUrl)).resolves.toMatchObject({
      'XSRF-TOKEN': {
        value: 'csrf-login-2',
      },
    });
  });

  it('registers, performs the follow-up login, and preserves the register welcome state', async () => {
    let csrfTokenVersion = 0;

    const harness = createHarness((request) => {
      if (
        request.method === 'GET' &&
        getPathname(request.url) === '/api/v1/auth/csrf'
      ) {
        csrfTokenVersion += 1;

        return successResponse(200, {
          token: `csrf-register-${csrfTokenVersion}`,
        });
      }

      if (
        request.method === 'POST' &&
        getPathname(request.url) === '/api/v1/auth/register'
      ) {
        return successResponse(200, {
          memberId: 2,
          email: 'new@fix.com',
          name: 'New User',
        });
      }

      if (
        request.method === 'POST' &&
        getPathname(request.url) === '/api/v1/auth/login'
      ) {
        return successResponse(200, {
          memberId: 2,
          email: 'new@fix.com',
          name: 'New User',
        });
      }

      if (
        request.method === 'GET' &&
        getPathname(request.url) === '/api/v1/auth/session'
      ) {
        return successResponse(200, {
          ...memberFixture,
          email: 'new@fix.com',
          name: 'New User',
        });
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
      success: true,
      member: {
        email: 'new@fix.com',
      },
    });
    expect(authStore.getState()).toMatchObject({
      status: 'authenticated',
      member: {
        ...memberFixture,
        email: 'new@fix.com',
        name: 'New User',
      },
    });
    expect(harness.getNavigationState()).toMatchObject({
      stack: 'app',
      welcomeVariant: 'register',
    });

    const registerCall = findCall(harness.calls, '/api/v1/auth/register', 'POST');
    const loginCall = findCall(harness.calls, '/api/v1/auth/login', 'POST');

    expect(registerCall?.headers['X-XSRF-TOKEN']).toBe('csrf-register-1');
    expect(loginCall?.headers['X-XSRF-TOKEN']).toBe('csrf-register-1');
    expect(getFormBody(registerCall?.body)).toEqual({
      email: 'new@fix.com',
      name: 'New User',
      password: 'Test1234!',
    });
    expect(getFormBody(loginCall?.body)).toEqual({
      email: 'new@fix.com',
      password: 'Test1234!',
    });
  });

  it('maps invalid login responses to the standardized global auth copy', async () => {
    const harness = createHarness((request) => {
      if (
        request.method === 'GET' &&
        getPathname(request.url) === '/api/v1/auth/csrf'
      ) {
        return successResponse(200, {
          token: 'csrf-invalid-login',
        });
      }

      if (
        request.method === 'POST' &&
        getPathname(request.url) === '/api/v1/auth/login'
      ) {
        return errorResponse(
          401,
          'AUTH-001',
          'Credential mismatch',
          'Username or password was invalid',
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
    expect(authStore.getState()).toMatchObject({
      status: 'anonymous',
      member: null,
    });
    expect(harness.getNavigationState()).toMatchObject({
      stack: 'auth',
      authRoute: 'login',
    });
  });

  it.each([
    ['AUTH-002', 401, '로그인 시도가 잠겨 있습니다. 잠시 후 다시 시도해 주세요.'],
    ['RATE-001', 429, '로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.'],
  ])(
    'maps %s login failures to consistent recoverable feedback',
    async (code, status, expectedMessage) => {
      const harness = createHarness((request) => {
        if (
          request.method === 'GET' &&
          getPathname(request.url) === '/api/v1/auth/csrf'
        ) {
          return successResponse(200, {
            token: `csrf-${code}`,
          });
        }

        if (
          request.method === 'POST' &&
          getPathname(request.url) === '/api/v1/auth/login'
        ) {
          return errorResponse(
            status,
            code,
            `${code} backend message`,
            'Auth guardrail triggered for login',
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
        globalMessage: expectedMessage,
      });
      expect(authStore.getState()).toMatchObject({
        status: 'anonymous',
        member: null,
      });
      expect(harness.getNavigationState()).toMatchObject({
        stack: 'auth',
        authRoute: 'login',
      });
    },
  );

  it('maps unknown login failures to the safe fallback with a visible correlation id', async () => {
    const harness = createHarness((request) => {
      if (
        request.method === 'GET' &&
        getPathname(request.url) === '/api/v1/auth/csrf'
      ) {
        return successResponse(200, {
          token: 'csrf-auth-unknown',
        });
      }

      if (
        request.method === 'POST' &&
        getPathname(request.url) === '/api/v1/auth/login'
      ) {
        return errorResponse(
          500,
          'AUTH-999',
          'Raw backend details should not leak',
          'Unexpected auth subsystem failure',
          {
            traceId: 'corr-123',
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
        '로그인을 완료할 수 없습니다. 잠시 후 다시 시도해 주세요. 문제가 계속되면 고객센터에 문의해 주세요. 문의 코드: corr-123',
    });
    expect(
      resolveAuthErrorPresentation(
        (result as Extract<typeof result, { success: false }>).error,
      ),
    ).toMatchObject({
      semantic: 'unknown',
      traceId: 'corr-123',
    });
  });

  it('maps duplicate-email registration failures to the email field', async () => {
    const harness = createHarness((request) => {
      if (
        request.method === 'GET' &&
        getPathname(request.url) === '/api/v1/auth/csrf'
      ) {
        return successResponse(200, {
          token: 'csrf-register-email-error',
        });
      }

      if (
        request.method === 'POST' &&
        getPathname(request.url) === '/api/v1/auth/register'
      ) {
        return errorResponse(
          409,
          'AUTH-017',
          'Email already exists',
          'Duplicate email',
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

  it('routes protected-session failures to deterministic re-auth navigation', async () => {
    const harness = createHarness((request) => {
      if (
        request.method === 'GET' &&
        getPathname(request.url) === '/api/v1/auth/session'
      ) {
        return errorResponse(
          401,
          'AUTH-003',
          'Authentication required',
          'Session is missing or invalid',
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

  it('treats sessions invalidated by a newer login as deterministic re-auth flows', async () => {
    const harness = createHarness((request) => {
      if (
        request.method === 'GET' &&
        getPathname(request.url) === '/api/v1/auth/session'
      ) {
        return errorResponse(
          401,
          'AUTH-016',
          'Session invalidated by another login',
          'Existing session was invalidated by a newer device login',
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

  it('revalidates the session on app resume and rejects stale sessions deterministically', async () => {
    const harness = createHarness((request) => {
      if (
        request.method === 'GET' &&
        getPathname(request.url) === '/api/v1/auth/csrf'
      ) {
        return successResponse(200, {
          token: 'csrf-resume',
        });
      }

      if (
        request.method === 'GET' &&
        getPathname(request.url) === '/api/v1/auth/session'
      ) {
        return errorResponse(
          410,
          'CHANNEL-001',
          'Redis session expired',
          'Session cache entry expired while app was backgrounded',
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

    const csrfCallIndex = harness.calls.findIndex(
      (call) =>
        call.method === 'GET' && getPathname(call.url) === '/api/v1/auth/csrf',
    );
    const sessionCallIndex = harness.calls.findIndex(
      (call) =>
        call.method === 'GET' && getPathname(call.url) === '/api/v1/auth/session',
    );

    expect(csrfCallIndex).toBeGreaterThanOrEqual(0);
    expect(sessionCallIndex).toBeGreaterThanOrEqual(0);
    expect(csrfCallIndex).toBeLessThan(sessionCallIndex);
    expect(harness.getNavigationState()).toMatchObject({
      stack: 'auth',
      authRoute: 'login',
    });
  });
});
