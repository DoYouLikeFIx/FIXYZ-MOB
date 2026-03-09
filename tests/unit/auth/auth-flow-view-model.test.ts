import {
  createAuthFlowViewModel,
} from '@/auth/auth-flow-view-model';
import { createAuthNavigationState, enterAuthenticatedApp } from '@/navigation/auth-navigation';
import type { NormalizedHttpError } from '@/network/types';
import { authStore, resetAuthStore } from '@/store/auth-store';
import type { Member } from '@/types/auth';

const memberFixture: Member = {
  memberUuid: 'member-001',
  username: 'demo',
  email: 'demo@fix.com',
  name: 'Demo User',
  role: 'ROLE_USER',
  totpEnrolled: false,
};

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

type AuthServiceStub = {
  bootstrap: ReturnType<typeof vi.fn>;
  loginMember: ReturnType<typeof vi.fn>;
  registerMember: ReturnType<typeof vi.fn>;
  refreshProtectedSession: ReturnType<typeof vi.fn>;
  revalidateSessionOnResume: ReturnType<typeof vi.fn>;
};

const createServiceStub = (): AuthServiceStub => ({
  bootstrap: vi.fn(),
  loginMember: vi.fn(),
  registerMember: vi.fn(),
  refreshProtectedSession: vi.fn(),
  revalidateSessionOnResume: vi.fn(),
});

describe('auth flow view model', () => {
  let authService: AuthServiceStub;

  beforeEach(() => {
    resetAuthStore();
    authService = createServiceStub();
  });

  it('bootstraps an existing session into the authenticated app route', async () => {
    authService.bootstrap.mockResolvedValue({
      recoveredSession: true,
      member: memberFixture,
      error: null,
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    await viewModel.bootstrap();

    expect(authStore.getState()).toMatchObject({
      status: 'authenticated',
      member: memberFixture,
    });
    expect(viewModel.getState().navigationState).toMatchObject({
      stack: 'app',
      welcomeVariant: 'login',
    });
  });

  it('opens register and login routes while clearing transient errors', () => {
    authStore.requireReauth('세션이 만료되었습니다. 다시 로그인해 주세요.');

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    viewModel.openRegister();
    expect(viewModel.getState().navigationState.authRoute).toBe('register');
    expect(authStore.getState().reauthMessage).toBeNull();

    viewModel.openLogin();
    expect(viewModel.getState().navigationState.authRoute).toBe('login');
  });

  it('submits login through the service and enters the app route on success', async () => {
    authService.loginMember.mockResolvedValue({
      success: true,
      member: memberFixture,
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    const result = await viewModel.submitLogin({
      username: 'demo',
      password: 'Test1234!',
    });

    expect(result).toEqual({
      success: true,
      member: memberFixture,
    });
    expect(authStore.getState().status).toBe('authenticated');
    expect(viewModel.getState().navigationState).toMatchObject({
      stack: 'app',
      welcomeVariant: 'login',
    });
  });

  it('routes protected-session reauth failures back to login deterministically', async () => {
    authService.refreshProtectedSession.mockResolvedValue({
      status: 'reauth',
      error: createHttpError({
        code: 'AUTH-003',
        status: 401,
        message: 'Authentication required',
      }),
    });
    authStore.login(memberFixture);

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
      initialNavigationState: enterAuthenticatedApp(createAuthNavigationState(), {
        source: 'login',
      }),
    });

    const result = await viewModel.refreshProtectedSession();

    expect(result.status).toBe('reauth');
    expect(authStore.getState()).toMatchObject({
      status: 'anonymous',
      reauthMessage: '세션이 만료되었습니다. 다시 로그인해 주세요.',
    });
    expect(viewModel.getState().navigationState).toMatchObject({
      stack: 'auth',
      authRoute: 'login',
    });
  });

  it('revalidates on app resume when the store is authenticated', async () => {
    authService.revalidateSessionOnResume.mockResolvedValue({
      status: 'authenticated',
      member: memberFixture,
    });
    authStore.login(memberFixture);

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
      initialAppState: 'background',
      initialNavigationState: enterAuthenticatedApp(createAuthNavigationState(), {
        source: 'login',
      }),
    });

    viewModel.handleAppStateChange('active');
    await Promise.resolve();

    expect(authService.revalidateSessionOnResume).toHaveBeenCalledTimes(1);
  });
});
