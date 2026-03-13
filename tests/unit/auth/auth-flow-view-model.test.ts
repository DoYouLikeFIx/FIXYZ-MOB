import { createAuthFlowViewModel } from '@/auth/auth-flow-view-model';
import {
  createAuthNavigationState,
  enterAuthenticatedApp,
} from '@/navigation/auth-navigation';
import type { NormalizedHttpError } from '@/network/types';
import { authStore, resetAuthStore } from '@/store/auth-store';
import type { LoginChallenge, Member, TotpRebindBootstrap } from '@/types/auth';

const memberFixture: Member = {
  memberUuid: 'member-001',
  email: 'demo@fix.com',
  name: 'Demo User',
  role: 'ROLE_USER',
  totpEnrolled: false,
};

const verifyChallengeFixture: LoginChallenge = {
  loginToken: 'login-token',
  nextAction: 'VERIFY_TOTP',
  totpEnrolled: true,
  expiresAt: '2026-03-12T10:00:00Z',
};

const enrollChallengeFixture: LoginChallenge = {
  loginToken: 'register-login-token',
  nextAction: 'ENROLL_TOTP',
  totpEnrolled: false,
  expiresAt: '2026-03-12T10:05:00Z',
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
  error.retryAfterSeconds = overrides.retryAfterSeconds;
  error.enrollUrl = overrides.enrollUrl;
  error.recoveryUrl = overrides.recoveryUrl;

  return error;
};

const rebindBootstrapFixture: TotpRebindBootstrap = {
  rebindToken: 'rebind-token',
  qrUri: 'otpauth://totp/FIX:demo@fix.com?secret=ABC123',
  manualEntryKey: 'ABC123',
  enrollmentToken: 'enrollment-token',
  expiresAt: '2026-03-12T10:05:00Z',
};

type AuthServiceStub = {
  bootstrap: ReturnType<typeof vi.fn>;
  startLoginFlow: ReturnType<typeof vi.fn>;
  verifyLoginOtp: ReturnType<typeof vi.fn>;
  beginTotpEnrollment: ReturnType<typeof vi.fn>;
  confirmTotpEnrollment: ReturnType<typeof vi.fn>;
  registerMember: ReturnType<typeof vi.fn>;
  requestPasswordResetEmail: ReturnType<typeof vi.fn>;
  requestPasswordRecoveryChallenge: ReturnType<typeof vi.fn>;
  resetPassword: ReturnType<typeof vi.fn>;
  bootstrapAuthenticatedTotpRebind: ReturnType<typeof vi.fn>;
  bootstrapRecoveryTotpRebind: ReturnType<typeof vi.fn>;
  confirmMfaRecoveryRebind: ReturnType<typeof vi.fn>;
  refreshProtectedSession: ReturnType<typeof vi.fn>;
  revalidateSessionOnResume: ReturnType<typeof vi.fn>;
};

const createServiceStub = (): AuthServiceStub => ({
  bootstrap: vi.fn(),
  startLoginFlow: vi.fn(),
  verifyLoginOtp: vi.fn(),
  beginTotpEnrollment: vi.fn(),
  confirmTotpEnrollment: vi.fn(),
  registerMember: vi.fn(),
  requestPasswordResetEmail: vi.fn(),
  requestPasswordRecoveryChallenge: vi.fn(),
  resetPassword: vi.fn(),
  bootstrapAuthenticatedTotpRebind: vi.fn(),
  bootstrapRecoveryTotpRebind: vi.fn(),
  confirmMfaRecoveryRebind: vi.fn(),
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

  it('stores the pending MFA challenge after the password step succeeds', async () => {
    authService.startLoginFlow.mockResolvedValue({
      success: true,
      challenge: verifyChallengeFixture,
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
    });
    expect(viewModel.getState()).toMatchObject({
      pendingMfa: verifyChallengeFixture,
      navigationState: {
        stack: 'auth',
        authRoute: 'login',
      },
    });
    expect(authStore.getState()).toMatchObject({
      status: 'checking',
      member: null,
    });
  });

  it('authenticates after a successful MFA verification step', async () => {
    authService.startLoginFlow.mockResolvedValue({
      success: true,
      challenge: verifyChallengeFixture,
    });
    authService.verifyLoginOtp.mockResolvedValue({
      success: true,
      member: {
        ...memberFixture,
        totpEnrolled: true,
      },
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    await viewModel.submitLogin({
      email: 'demo@fix.com',
      password: 'Test1234!',
    });

    const result = await viewModel.submitLoginMfa({
      loginToken: verifyChallengeFixture.loginToken,
      otpCode: '123456',
    });

    expect(result).toEqual({
      success: true,
    });
    expect(authStore.getState()).toMatchObject({
      status: 'authenticated',
      member: {
        ...memberFixture,
        totpEnrolled: true,
      },
    });
    expect(viewModel.getState()).toMatchObject({
      pendingMfa: null,
      navigationState: {
        stack: 'app',
        welcomeVariant: 'login',
      },
    });
  });

  it('redirects MFA verification failures requiring enrollment into the enrollment route', async () => {
    authService.startLoginFlow.mockResolvedValue({
      success: true,
      challenge: verifyChallengeFixture,
    });
    authService.verifyLoginOtp.mockResolvedValue({
      success: false,
      error: createHttpError({
        code: 'AUTH-009',
        status: 403,
        message: 'TOTP enrollment required',
        enrollUrl: '/settings/totp/enroll',
      }),
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    await viewModel.submitLogin({
      email: 'demo@fix.com',
      password: 'Test1234!',
    });

    const result = await viewModel.submitLoginMfa({
      loginToken: verifyChallengeFixture.loginToken,
      otpCode: '123456',
    });

    expect(result).toEqual({
      success: true,
    });
    expect(viewModel.getState()).toMatchObject({
      pendingMfa: {
        ...verifyChallengeFixture,
        nextAction: 'ENROLL_TOTP',
      },
      navigationState: {
        authRoute: 'totpEnroll',
      },
    });
  });

  it('loads TOTP enrollment data from the pending challenge token', async () => {
    authService.startLoginFlow.mockResolvedValue({
      success: true,
      challenge: enrollChallengeFixture,
    });
    authService.beginTotpEnrollment.mockResolvedValue({
      success: true,
      enrollment: {
        qrUri: 'otpauth://totp/FIX:new@fix.com?secret=ABC123',
        manualEntryKey: 'ABC123',
        enrollmentToken: 'enrollment-token',
        expiresAt: '2026-03-12T10:08:00Z',
      },
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    await viewModel.submitLogin({
      email: 'new@fix.com',
      password: 'Test1234!',
    });

    const result = await viewModel.loadTotpEnrollment();

    expect(result).toEqual({
      success: true,
      enrollment: {
        qrUri: 'otpauth://totp/FIX:new@fix.com?secret=ABC123',
        manualEntryKey: 'ABC123',
        enrollmentToken: 'enrollment-token',
        expiresAt: '2026-03-12T10:08:00Z',
      },
    });
    expect(authService.beginTotpEnrollment).toHaveBeenCalledWith({
      loginToken: enrollChallengeFixture.loginToken,
    });
  });

  it('completes TOTP enrollment and enters the app with the register welcome state', async () => {
    authService.registerMember.mockResolvedValue({
      success: true,
      member: {
        ...memberFixture,
        email: 'new@fix.com',
        name: 'New User',
        totpEnrolled: false,
      },
    });
    authService.startLoginFlow.mockResolvedValue({
      success: true,
      challenge: enrollChallengeFixture,
    });
    authService.confirmTotpEnrollment.mockResolvedValue({
      success: true,
      member: {
        ...memberFixture,
        email: 'new@fix.com',
        name: 'New User',
        totpEnrolled: true,
      },
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    await viewModel.submitRegister({
      email: 'new@fix.com',
      name: 'New User',
      password: 'Test1234!',
    });

    const result = await viewModel.submitTotpEnrollmentConfirmation({
      loginToken: enrollChallengeFixture.loginToken,
      enrollmentToken: 'enrollment-token',
      otpCode: '123456',
    });

    expect(result).toEqual({
      success: true,
    });
    expect(authStore.getState()).toMatchObject({
      status: 'authenticated',
      member: {
        email: 'new@fix.com',
        name: 'New User',
        totpEnrolled: true,
      },
    });
    expect(viewModel.getState()).toMatchObject({
      pendingMfa: null,
      navigationState: {
        stack: 'app',
        welcomeVariant: 'register',
      },
    });
  });

  it('keeps the login welcome state when enrollment is completed after a login-driven MFA redirect', async () => {
    authService.startLoginFlow.mockResolvedValue({
      success: true,
      challenge: verifyChallengeFixture,
    });
    authService.verifyLoginOtp.mockResolvedValue({
      success: false,
      error: createHttpError({
        code: 'AUTH-009',
        status: 403,
        message: 'TOTP enrollment required',
        enrollUrl: '/settings/totp/enroll',
      }),
    });
    authService.confirmTotpEnrollment.mockResolvedValue({
      success: true,
      member: {
        ...memberFixture,
        totpEnrolled: true,
      },
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    await viewModel.submitLogin({
      email: 'demo@fix.com',
      password: 'Test1234!',
    });
    await viewModel.submitLoginMfa({
      loginToken: verifyChallengeFixture.loginToken,
      otpCode: '123456',
    });

    const result = await viewModel.submitTotpEnrollmentConfirmation({
      loginToken: verifyChallengeFixture.loginToken,
      enrollmentToken: 'enrollment-token',
      otpCode: '123456',
    });

    expect(result).toEqual({
      success: true,
    });
    expect(viewModel.getState()).toMatchObject({
      navigationState: {
        stack: 'app',
        welcomeVariant: 'login',
      },
    });
  });

  it('registers then starts the MFA challenge for the follow-up flow', async () => {
    authService.registerMember.mockResolvedValue({
      success: true,
      member: {
        ...memberFixture,
        email: 'new@fix.com',
        name: 'New User',
      },
    });
    authService.startLoginFlow.mockResolvedValue({
      success: true,
      challenge: enrollChallengeFixture,
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    const result = await viewModel.submitRegister({
      email: 'new@fix.com',
      name: 'New User',
      password: 'Test1234!',
    });

    expect(result).toEqual({
      success: true,
    });
    expect(authService.startLoginFlow).toHaveBeenCalledWith({
      email: 'new@fix.com',
      password: 'Test1234!',
    });
    expect(viewModel.getState()).toMatchObject({
      pendingMfa: enrollChallengeFixture,
      navigationState: {
        authRoute: 'totpEnroll',
      },
    });
  });

  it('returns unenrolled registrations to the TOTP enrollment route on a later login attempt', async () => {
    authService.startLoginFlow
      .mockResolvedValueOnce({
        success: true,
        challenge: enrollChallengeFixture,
      })
      .mockResolvedValueOnce({
        success: true,
        challenge: {
          ...enrollChallengeFixture,
          loginToken: 'register-login-token-2',
        },
      });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    await viewModel.submitLogin({
      email: 'new@fix.com',
      password: 'Test1234!',
    });

    viewModel.resetPendingMfa();

    const result = await viewModel.submitLogin({
      email: 'new@fix.com',
      password: 'Test1234!',
    });

    expect(result).toEqual({
      success: true,
    });
    expect(viewModel.getState()).toMatchObject({
      pendingMfa: {
        ...enrollChallengeFixture,
        loginToken: 'register-login-token-2',
      },
      navigationState: {
        authRoute: 'totpEnroll',
      },
    });
    expect(authService.startLoginFlow).toHaveBeenNthCalledWith(2, {
      email: 'new@fix.com',
      password: 'Test1234!',
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

  it('routes MFA verification recovery-required errors into the recovery flow and preserves the login email', async () => {
    authService.startLoginFlow.mockResolvedValue({
      success: true,
      challenge: verifyChallengeFixture,
    });
    authService.verifyLoginOtp.mockResolvedValue({
      success: false,
      error: createHttpError({
        code: 'AUTH-021',
        status: 403,
        message: 'MFA recovery required',
        recoveryUrl: '/mfa-recovery',
      }),
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    await viewModel.submitLogin({
      email: 'demo@fix.com',
      password: 'Test1234!',
    });

    const result = await viewModel.submitLoginMfa({
      loginToken: verifyChallengeFixture.loginToken,
      otpCode: '123456',
    });

    expect(result).toEqual({
      success: true,
    });
    expect(viewModel.getState()).toMatchObject({
      pendingMfa: null,
      mfaRecovery: {
        suggestedEmail: 'demo@fix.com',
        recoveryProof: null,
        bootstrap: null,
      },
      navigationState: {
        authRoute: 'mfaRecovery',
      },
    });
  });

  it('routes password reset continuations with recovery proof into the MFA recovery flow', async () => {
    authService.resetPassword.mockResolvedValue({
      success: true,
      continuation: {
        recoveryProof: 'recovery-proof-token',
        recoveryProofExpiresInSeconds: 600,
      },
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
    });

    const result = await viewModel.submitPasswordReset({
      token: 'reset-token',
      newPassword: 'Test1234!',
    });

    expect(result).toEqual({
      success: true,
      continuation: {
        recoveryProof: 'recovery-proof-token',
        recoveryProofExpiresInSeconds: 600,
      },
    });
    expect(viewModel.getState()).toMatchObject({
      mfaRecovery: {
        recoveryProof: 'recovery-proof-token',
        recoveryProofExpiresInSeconds: 600,
        bootstrap: null,
      },
      navigationState: {
        authRoute: 'mfaRecovery',
      },
    });
  });

  it('bootstraps authenticated MFA recovery and routes to the rebind screen', async () => {
    authStore.login({
      ...memberFixture,
      totpEnrolled: true,
    });
    authService.bootstrapAuthenticatedTotpRebind.mockResolvedValue({
      success: true,
      bootstrap: rebindBootstrapFixture,
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
      initialNavigationState: enterAuthenticatedApp(createAuthNavigationState(), {
        source: 'login',
      }),
    });

    viewModel.openAuthenticatedMfaRecovery();

    const result = await viewModel.bootstrapAuthenticatedMfaRecovery({
      currentPassword: 'Test1234!',
    });

    expect(result).toEqual({
      success: true,
      bootstrap: rebindBootstrapFixture,
    });
    expect(viewModel.getState()).toMatchObject({
      mfaRecovery: {
        suggestedEmail: memberFixture.email,
        bootstrap: rebindBootstrapFixture,
      },
      navigationState: {
        authRoute: 'mfaRecoveryRebind',
      },
    });
  });

  it('completes MFA recovery rebind, clears the session, and returns to login with success guidance', async () => {
    authStore.login({
      ...memberFixture,
      totpEnrolled: true,
    });
    authService.bootstrapAuthenticatedTotpRebind.mockResolvedValue({
      success: true,
      bootstrap: rebindBootstrapFixture,
    });
    authService.confirmMfaRecoveryRebind.mockResolvedValue({
      success: true,
      response: {
        rebindCompleted: true,
        reauthRequired: true,
      },
    });

    const viewModel = createAuthFlowViewModel({
      authService: authService as never,
      authStore,
      initialNavigationState: enterAuthenticatedApp(createAuthNavigationState(), {
        source: 'login',
      }),
    });

    viewModel.openAuthenticatedMfaRecovery();
    await viewModel.bootstrapAuthenticatedMfaRecovery({
      currentPassword: 'Test1234!',
    });

    const result = await viewModel.submitMfaRecoveryRebindConfirmation({
      rebindToken: rebindBootstrapFixture.rebindToken,
      enrollmentToken: rebindBootstrapFixture.enrollmentToken,
      otpCode: '123456',
    });

    expect(result).toEqual({
      success: true,
      response: {
        rebindCompleted: true,
        reauthRequired: true,
      },
    });
    expect(authStore.getState()).toMatchObject({
      status: 'anonymous',
      member: null,
    });
    expect(viewModel.getState()).toMatchObject({
      authBannerTone: 'success',
      authBannerMessage: '새 authenticator 등록이 완료되었습니다. 새 비밀번호와 현재 인증 코드로 다시 로그인해 주세요.',
      mfaRecovery: null,
      navigationState: {
        authRoute: 'login',
      },
    });
  });
});
