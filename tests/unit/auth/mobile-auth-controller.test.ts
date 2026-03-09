import {
  createMobileAuthController,
  type AuthApi,
} from '@/auth/mobile-auth-controller';
import { createAuthNavigationState } from '@/navigation/auth-navigation';
import type { CsrfTokenManager } from '@/network/csrf';
import type { NormalizedHttpError } from '@/network/types';
import { authStore, resetAuthStore } from '@/store/auth-store';

const createHttpError = (
  overrides: Partial<NormalizedHttpError> & { message?: string } = {},
): NormalizedHttpError => {
  const error = new Error(
    overrides.message ?? 'Unexpected server response. Please try again.',
  ) as NormalizedHttpError;

  error.name = 'MobHttpClientError';
  error.code = overrides.code;
  error.status = overrides.status;
  error.detail = overrides.detail;
  error.retriable = overrides.retriable;

  return error;
};

describe('mobile auth controller', () => {
  const authApi: AuthApi = {
    fetchSession: vi.fn(),
    loginMember: vi.fn(),
    registerMember: vi.fn(),
  };

  const csrfManager = {
    onForegroundResume: vi.fn(async () => {}),
  } as Pick<CsrfTokenManager, 'onForegroundResume'>;

  let navigationState = createAuthNavigationState();

  const createController = () =>
    createMobileAuthController({
      authApi,
      authStore,
      csrfManager,
      getNavigationState: () => navigationState,
      setNavigationState: (nextState) => {
        navigationState = nextState;
      },
    });

  beforeEach(() => {
    navigationState = createAuthNavigationState();
    resetAuthStore();
    vi.mocked(authApi.fetchSession).mockReset();
    vi.mocked(authApi.loginMember).mockReset();
    vi.mocked(authApi.registerMember).mockReset();
    vi.mocked(csrfManager.onForegroundResume).mockClear();
  });

  it('logs in and routes to the protected stack when credentials are valid', async () => {
    vi.mocked(authApi.loginMember).mockResolvedValue({
      memberUuid: 'member-001',
      username: 'demo',
      email: 'demo@fix.com',
      name: 'Demo User',
      role: 'ROLE_USER',
      totpEnrolled: false,
    });

    const controller = createController();
    const result = await controller.submitLogin({
      username: 'demo',
      password: 'Test1234!',
    });

    expect(result.success).toBe(true);
    expect(authStore.getState().status).toBe('authenticated');
    expect(navigationState.stack).toBe('app');
  });

  it('opens the login screen through the controller and clears any reauth copy', () => {
    authStore.requireReauth('세션이 만료되었습니다. 다시 로그인해 주세요.');
    navigationState.stack = 'app';

    const controller = createController();
    controller.openLogin();

    expect(authStore.getState().reauthMessage).toBeNull();
    expect(navigationState).toMatchObject({
      stack: 'auth',
      authRoute: 'login',
    });
  });

  it('opens the register screen through the controller and clears any reauth copy', () => {
    authStore.requireReauth('세션이 만료되었습니다. 다시 로그인해 주세요.');

    const controller = createController();
    controller.openRegister();

    expect(authStore.getState().reauthMessage).toBeNull();
    expect(navigationState).toMatchObject({
      stack: 'auth',
      authRoute: 'register',
    });
  });

  it('registers, logs in, and enters the protected stack', async () => {
    vi.mocked(authApi.registerMember).mockResolvedValue({
      memberUuid: 'member-002',
      username: 'new_user',
      email: 'new@fix.com',
      name: 'New User',
      role: 'ROLE_USER',
      totpEnrolled: false,
    });
    vi.mocked(authApi.loginMember).mockResolvedValue({
      memberUuid: 'member-002',
      username: 'new_user',
      email: 'new@fix.com',
      name: 'New User',
      role: 'ROLE_USER',
      totpEnrolled: false,
    });

    const controller = createController();
    const result = await controller.submitRegister({
      username: 'new_user',
      email: 'new@fix.com',
      name: 'New User',
      password: 'Test1234!',
      confirmPassword: 'Test1234!',
    });

    expect(result.success).toBe(true);
    expect(vi.mocked(authApi.registerMember)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(authApi.loginMember)).toHaveBeenCalledWith({
      username: 'new@fix.com',
      password: 'Test1234!',
    });
    expect(navigationState).toMatchObject({
      stack: 'app',
      welcomeVariant: 'register',
    });
  });

  it('returns field-level validation without calling the API when login input is incomplete', async () => {
    const controller = createController();
    const result = await controller.submitLogin({
      username: 'demo',
      password: '',
    });

    expect(result.success).toBe(false);
    expect(result.feedback.fieldErrors.password).toBe(true);
    expect(result.feedback.fieldMessages.password).toBe('비밀번호를 입력해 주세요.');
    expect(vi.mocked(authApi.loginMember)).not.toHaveBeenCalled();
  });

  it('routes protected-session failures to the re-auth flow', async () => {
    vi.mocked(authApi.fetchSession).mockRejectedValue(
      createHttpError({
        code: 'AUTH-003',
        status: 401,
        message: 'Authentication required',
      }),
    );

    const controller = createController();
    await controller.submitLogin({
      username: 'demo',
      password: 'Test1234!',
    });
    navigationState.stack = 'app';
    authStore.login({
      memberUuid: 'member-001',
      username: 'demo',
      email: 'demo@fix.com',
      name: 'Demo User',
      role: 'ROLE_USER',
      totpEnrolled: false,
    });

    const result = await controller.refreshProtectedSession();

    expect(result.status).toBe('reauth');
    expect(authStore.getState()).toMatchObject({
      status: 'anonymous',
      reauthMessage: '세션이 만료되었습니다. 다시 로그인해 주세요.',
    });
    expect(navigationState.stack).toBe('auth');
    expect(navigationState.authRoute).toBe('login');
  });

  it('revalidates the session when the app resumes and rejects stale sessions', async () => {
    vi.mocked(authApi.fetchSession).mockRejectedValue(
      createHttpError({
        code: 'CHANNEL-001',
        status: 410,
        message: 'Redis session expired',
      }),
    );

    authStore.login({
      memberUuid: 'member-001',
      username: 'demo',
      email: 'demo@fix.com',
      name: 'Demo User',
      role: 'ROLE_USER',
      totpEnrolled: false,
    });
    navigationState.stack = 'app';

    const controller = createController();
    const result = await controller.revalidateSessionOnResume();

    expect(vi.mocked(csrfManager.onForegroundResume)).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('reauth');
    expect(authStore.getState().status).toBe('anonymous');
    expect(navigationState.stack).toBe('auth');
  });
});
