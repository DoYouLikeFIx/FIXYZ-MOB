import {
  createAuthFlowViewModel,
} from '@/auth/auth-flow-view-model';
import { createAuthNavigationState, enterAuthenticatedApp } from '@/navigation/auth-navigation';
import type { NormalizedHttpError } from '@/network/types';
import { authStore, resetAuthStore } from '@/store/auth-store';
import type { Member } from '@/types/auth';

const memberFixture: Member = {
  memberUuid: 'member-001',
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
  requestPasswordResetEmail: ReturnType<typeof vi.fn>;
  requestPasswordRecoveryChallenge: ReturnType<typeof vi.fn>;
  resetPassword: ReturnType<typeof vi.fn>;
  refreshProtectedSession: ReturnType<typeof vi.fn>;
  revalidateSessionOnResume: ReturnType<typeof vi.fn>;
};

const createServiceStub = (): AuthServiceStub => ({
  bootstrap: vi.fn(),
  loginMember: vi.fn(),
  registerMember: vi.fn(),
  requestPasswordResetEmail: vi.fn(),
  requestPasswordRecoveryChallenge: vi.fn(),
  resetPassword: vi.fn(),
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

  it('preserves a reset-password handoff while anonymous bootstrap settles', async () => {
    authService.bootstrap.mockResolvedValue({
      recoveredSession: false,
      member: null,
      error: createHttpError({
        code: 'AUTH-003',
        status: 401,
        message: 'Authentication required',
      }),
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    viewModel.ingestPasswordResetToken('link-token');
    await viewModel.bootstrap();

    expect(authStore.getState().status).toBe('anonymous');
    expect(viewModel.getState().navigationState).toMatchObject({
      authRoute: 'resetPassword',
      resetPasswordToken: 'link-token',
    });
  });

  it('does not clobber a reset-password handoff when bootstrap recovers a session', async () => {
    authService.bootstrap.mockResolvedValue({
      recoveredSession: true,
      member: memberFixture,
      error: null,
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    viewModel.ingestPasswordResetToken('link-token');
    await viewModel.bootstrap();

    expect(authStore.getState()).toMatchObject({
      status: 'authenticated',
      member: memberFixture,
    });
    expect(viewModel.getState().navigationState).toMatchObject({
      stack: 'auth',
      authRoute: 'resetPassword',
      resetPasswordToken: 'link-token',
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
      email: 'demo@fix.com',
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

  it('opens recovery routes and returns to login with a success banner after reset', async () => {
    authService.resetPassword.mockResolvedValue({
      success: true,
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    viewModel.openForgotPassword();
    expect(viewModel.getState().navigationState.authRoute).toBe('forgotPassword');

    viewModel.openResetPassword('handoff-token');
    expect(viewModel.getState().navigationState).toMatchObject({
      authRoute: 'resetPassword',
      resetPasswordToken: 'handoff-token',
    });

    await viewModel.submitPasswordReset({
      token: 'reset-token',
      newPassword: 'Test1234!',
    });

    expect(viewModel.getState()).toMatchObject({
      authBannerMessage: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.',
      authBannerTone: 'success',
      navigationState: {
        authRoute: 'login',
      },
    });
  });

  it('routes reset AUTH-016 failures back to login with reauth guidance', async () => {
    authService.resetPassword.mockResolvedValue({
      success: false,
      error: createHttpError({
        code: 'AUTH-016',
        status: 401,
        message: 'Session invalidated by another login',
      }),
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    viewModel.openResetPassword('handoff-token');

    const result = await viewModel.submitPasswordReset({
      token: 'handoff-token',
      newPassword: 'Test1234!',
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.objectContaining({
        code: 'AUTH-016',
      }),
    });
    expect(authStore.getState().reauthMessage).toBe('세션이 만료되었습니다. 다시 로그인해 주세요.');
    expect(viewModel.getState().navigationState).toMatchObject({
      authRoute: 'login',
      resetPasswordToken: null,
    });
  });

  it('ingests a reset-token handoff into the dedicated reset route', () => {
    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    viewModel.ingestPasswordResetToken('link-token');

    expect(viewModel.getState().navigationState).toMatchObject({
      authRoute: 'resetPassword',
      resetPasswordToken: 'link-token',
    });
  });
});
