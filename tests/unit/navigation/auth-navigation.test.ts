import {
  createAuthNavigationState,
  enterAuthenticatedApp,
  openForgotPasswordRoute,
  openResetPasswordRoute,
  openRegisterRoute,
  requireReauthRoute,
} from '@/navigation/auth-navigation';

describe('mobile auth navigation state', () => {
  it('switches to the register form while staying in the auth stack', () => {
    expect(openRegisterRoute(createAuthNavigationState())).toMatchObject({
      stack: 'auth',
      authRoute: 'register',
      pendingProtectedRoute: 'portfolio',
    });
  });

  it('enters the protected app stack after authentication succeeds', () => {
    expect(
      enterAuthenticatedApp(createAuthNavigationState(), { source: 'register' }),
    ).toMatchObject({
      stack: 'app',
      protectedRoute: 'portfolio',
      pendingProtectedRoute: 'portfolio',
      welcomeVariant: 'register',
    });
  });

  it('routes expired sessions back to the login screen deterministically', () => {
    const authenticatedState = enterAuthenticatedApp(createAuthNavigationState(), {
      source: 'login',
    });

    expect(requireReauthRoute(authenticatedState)).toMatchObject({
      stack: 'auth',
      authRoute: 'login',
      pendingProtectedRoute: 'portfolio',
      welcomeVariant: null,
    });
  });

  it('opens the dedicated forgot-password and reset-password auth routes', () => {
    expect(openForgotPasswordRoute(createAuthNavigationState())).toMatchObject({
      stack: 'auth',
      authRoute: 'forgotPassword',
      resetPasswordToken: null,
    });

    expect(openResetPasswordRoute(createAuthNavigationState(), 'handoff-token')).toMatchObject({
      stack: 'auth',
      authRoute: 'resetPassword',
      resetPasswordToken: 'handoff-token',
    });
  });
});
