import type { AppStateStatus } from 'react-native';

import {
  createAuthNavigationState,
  enterAuthenticatedApp,
  openForgotPasswordRoute,
  openLoginRoute,
  openResetPasswordRoute,
  openRegisterRoute,
  openTotpEnrollRoute,
  requireReauthRoute,
  type AuthNavigationState,
} from '../navigation/auth-navigation';
import type { AuthState } from '../store/auth-store';
import type {
  LoginChallenge,
  LoginRequest,
  PasswordForgotRequest,
  PasswordRecoveryChallengeRequest,
  PasswordResetRequest,
  RegisterRequest,
  TotpEnrollmentConfirmationRequest,
  TotpEnrollmentRequest,
  TotpVerificationRequest,
} from '../types/auth';
import type {
  AuthMutationResult,
  BootstrapResult,
  FormSubmissionResult,
  PasswordForgotResult,
  PasswordRecoveryChallengeResult,
  PasswordResetResult,
  ProtectedRequestResult,
  TotpEnrollmentBootstrapResult,
} from '../types/auth-ui';

import {
  getAuthErrorMessage,
  getReauthMessage,
  isReauthError,
  resolveMfaErrorPresentation,
} from './auth-errors';

type Listener = () => void;
type PendingMfaSource = 'login' | 'register';
interface PendingMfaState extends LoginChallenge {
  source: PendingMfaSource;
}

export interface AuthStoreAdapter {
  getState: () => AuthState;
  initialize: (member: AuthState['member']) => void;
  login: (member: NonNullable<AuthState['member']>) => void;
  requireReauth: (message: string) => void;
  clearReauthMessage: () => void;
}

export interface AuthServiceAdapter {
  bootstrap: () => Promise<BootstrapResult>;
  startLoginFlow: (payload: LoginRequest) => Promise<{ success: true; challenge: LoginChallenge } | { success: false; error: unknown }>;
  verifyLoginOtp: (payload: TotpVerificationRequest) => Promise<AuthMutationResult>;
  beginTotpEnrollment: (
    payload: TotpEnrollmentRequest,
  ) => Promise<TotpEnrollmentBootstrapResult>;
  confirmTotpEnrollment: (
    payload: TotpEnrollmentConfirmationRequest,
  ) => Promise<AuthMutationResult>;
  registerMember: (payload: RegisterRequest) => Promise<AuthMutationResult>;
  requestPasswordResetEmail: (payload: PasswordForgotRequest) => Promise<PasswordForgotResult>;
  requestPasswordRecoveryChallenge: (
    payload: PasswordRecoveryChallengeRequest,
  ) => Promise<PasswordRecoveryChallengeResult>;
  resetPassword: (payload: PasswordResetRequest) => Promise<PasswordResetResult>;
  refreshProtectedSession: () => Promise<ProtectedRequestResult>;
  revalidateSessionOnResume: () => Promise<ProtectedRequestResult>;
}

export interface AuthFlowViewState {
  authBannerMessage: string | null;
  authBannerTone: 'info' | 'error' | 'success';
  navigationState: AuthNavigationState;
  pendingMfa: PendingMfaState | null;
  bootstrapErrorMessage: string | null;
  protectedErrorMessage: string | null;
  isRefreshingSession: boolean;
}

interface CreateAuthFlowViewModelInput {
  authService: AuthServiceAdapter;
  authStore: AuthStoreAdapter;
  initialAppState?: AppStateStatus;
  initialNavigationState?: AuthNavigationState;
}

const createDefaultViewState = (
  navigationState: AuthNavigationState,
): AuthFlowViewState => ({
  authBannerMessage: null,
  authBannerTone: 'info',
  navigationState,
  pendingMfa: null,
  bootstrapErrorMessage: null,
  protectedErrorMessage: null,
  isRefreshingSession: false,
});

const shouldPreserveRecoveryRoute = (
  navigationState: AuthNavigationState,
) => navigationState.stack === 'auth'
  && (
    navigationState.authRoute === 'forgotPassword'
    || navigationState.authRoute === 'resetPassword'
  );

export const createAuthFlowViewModel = ({
  authService,
  authStore,
  initialAppState = 'active',
  initialNavigationState = createAuthNavigationState(),
}: CreateAuthFlowViewModelInput) => {
  let state = createDefaultViewState(initialNavigationState);
  let appState = initialAppState;
  let activeRefresh: Promise<ProtectedRequestResult> | null = null;
  const listeners = new Set<Listener>();

  const emit = () => {
    listeners.forEach((listener) => {
      listener();
    });
  };

  const setState = (
    updater: Partial<AuthFlowViewState> | ((current: AuthFlowViewState) => AuthFlowViewState),
  ) => {
    state =
      typeof updater === 'function'
        ? updater(state)
        : {
            ...state,
            ...updater,
          };
    emit();
  };

  const clearTransientErrors = () => {
    authStore.clearReauthMessage();
    setState({
      authBannerMessage: null,
      authBannerTone: 'info',
      bootstrapErrorMessage: null,
      protectedErrorMessage: null,
    });
  };

  const openPendingMfaRoute = (
    navigationState: AuthNavigationState,
    challenge: LoginChallenge,
  ) => challenge.nextAction === 'ENROLL_TOTP'
    ? openTotpEnrollRoute(navigationState)
    : openLoginRoute(navigationState);

  const applyProtectedRequestResult = (
    result: ProtectedRequestResult,
  ) => {
    if (result.status === 'authenticated') {
      authStore.login(result.member);
      setState((current) => ({
        ...current,
        pendingMfa: null,
        navigationState: enterAuthenticatedApp(current.navigationState),
        protectedErrorMessage: null,
      }));

      return;
    }

    if (result.status === 'reauth') {
      authStore.requireReauth(getReauthMessage(result.error));
      setState((current) => ({
        ...current,
        pendingMfa: null,
        navigationState: requireReauthRoute(current.navigationState),
        protectedErrorMessage: null,
      }));

      return;
    }

    setState({
      protectedErrorMessage: getAuthErrorMessage(result.error),
    });
  };

  return {
    getState: () => state,

    subscribe(listener: Listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    async bootstrap(): Promise<BootstrapResult> {
      const result = await authService.bootstrap();
      authStore.initialize(result.member);

      setState((current) => ({
        ...current,
        navigationState: shouldPreserveRecoveryRoute(current.navigationState)
          ? current.navigationState
          : result.recoveredSession
            ? enterAuthenticatedApp(current.navigationState, {
                source: 'login',
              })
            : openLoginRoute(current.navigationState),
        pendingMfa: null,
        bootstrapErrorMessage:
          result.recoveredSession || result.error === null || isReauthError(result.error)
            ? null
            : getAuthErrorMessage(result.error),
      }));

      return result;
    },

    openLogin() {
      clearTransientErrors();
      setState((current) => ({
        ...current,
        pendingMfa: null,
        navigationState: openLoginRoute(current.navigationState),
      }));
    },

    openRegister() {
      clearTransientErrors();
      setState((current) => ({
        ...current,
        pendingMfa: null,
        navigationState: openRegisterRoute(current.navigationState),
      }));
    },

    openForgotPassword() {
      clearTransientErrors();
      setState((current) => ({
        ...current,
        pendingMfa: null,
        navigationState: openForgotPasswordRoute(current.navigationState),
      }));
    },

    openResetPassword(token?: string) {
      clearTransientErrors();
      setState((current) => ({
        ...current,
        pendingMfa: null,
        navigationState: openResetPasswordRoute(current.navigationState, token),
      }));
    },

    ingestPasswordResetToken(token: string) {
      clearTransientErrors();
      setState((current) => ({
        ...current,
        pendingMfa: null,
        navigationState: openResetPasswordRoute(current.navigationState, token),
      }));
    },

    async submitLogin(
      payload: LoginRequest,
    ): Promise<FormSubmissionResult> {
      clearTransientErrors();
      const result = await authService.startLoginFlow(payload);

      if (result.success) {
        setState((current) => ({
          ...current,
          pendingMfa: {
            ...result.challenge,
            source: 'login',
          },
          navigationState: openPendingMfaRoute(current.navigationState, result.challenge),
        }));

        return {
          success: true,
        };
      }

      return {
        success: false,
        error: result.error,
      };
    },

    resetPendingMfa() {
      clearTransientErrors();
      setState((current) => ({
        ...current,
        pendingMfa: null,
        navigationState: openLoginRoute(current.navigationState),
      }));
    },

    async submitLoginMfa(
      payload: TotpVerificationRequest,
    ): Promise<FormSubmissionResult> {
      clearTransientErrors();
      const result = await authService.verifyLoginOtp(payload);

      if (result.success) {
        authStore.login(result.member);
        setState((current) => ({
          ...current,
          pendingMfa: null,
          navigationState: enterAuthenticatedApp(current.navigationState, {
            source: 'login',
          }),
        }));

        return {
          success: true,
        };
      }

      const presentation = resolveMfaErrorPresentation(result.error);

      if (presentation.navigateToEnroll && state.pendingMfa) {
        setState((current) => ({
          ...current,
          pendingMfa: current.pendingMfa
            ? {
                ...current.pendingMfa,
                nextAction: 'ENROLL_TOTP',
              }
            : null,
          navigationState: openTotpEnrollRoute(current.navigationState),
        }));

        return {
          success: true,
        };
      }

      if (presentation.restartLogin) {
        authStore.requireReauth(presentation.message);
        setState((current) => ({
          ...current,
          pendingMfa: null,
          authBannerMessage: presentation.message,
          authBannerTone: 'info',
          navigationState: openLoginRoute(current.navigationState),
        }));

        return {
          success: true,
        };
      }

      return {
        success: false,
        error: result.error,
      };
    },

    async loadTotpEnrollment(): Promise<TotpEnrollmentBootstrapResult> {
      clearTransientErrors();

      if (!state.pendingMfa) {
        return {
          success: false,
          error: new Error('No pending MFA enrollment state is available.'),
        };
      }

      const result = await authService.beginTotpEnrollment({
        loginToken: state.pendingMfa.loginToken,
      });

      if (!result.success) {
        const presentation = resolveMfaErrorPresentation(result.error);

        if (presentation.restartLogin) {
          authStore.requireReauth(presentation.message);
          setState((current) => ({
            ...current,
            pendingMfa: null,
            authBannerMessage: presentation.message,
            authBannerTone: 'info',
            navigationState: openLoginRoute(current.navigationState),
          }));
        }
      }

      return result;
    },

    async submitTotpEnrollmentConfirmation(
      payload: TotpEnrollmentConfirmationRequest,
    ): Promise<FormSubmissionResult> {
      clearTransientErrors();
      const result = await authService.confirmTotpEnrollment(payload);
      const mfaSource = state.pendingMfa?.source ?? 'login';

      if (result.success) {
        authStore.login(result.member);
        setState((current) => ({
          ...current,
          pendingMfa: null,
          navigationState: enterAuthenticatedApp(current.navigationState, {
            source: mfaSource,
          }),
        }));

        return {
          success: true,
        };
      }

      const presentation = resolveMfaErrorPresentation(result.error);

      if (presentation.restartLogin) {
        authStore.requireReauth(presentation.message);
        setState((current) => ({
          ...current,
          pendingMfa: null,
          authBannerMessage: presentation.message,
          authBannerTone: 'info',
          navigationState: openLoginRoute(current.navigationState),
        }));

        return {
          success: true,
        };
      }

      return {
        success: false,
        error: result.error,
      };
    },

    async submitPasswordResetEmail(
      payload: PasswordForgotRequest,
    ): Promise<PasswordForgotResult> {
      clearTransientErrors();
      return authService.requestPasswordResetEmail(payload);
    },

    async submitPasswordRecoveryChallenge(
      payload: PasswordRecoveryChallengeRequest,
    ): Promise<PasswordRecoveryChallengeResult> {
      clearTransientErrors();
      return authService.requestPasswordRecoveryChallenge(payload);
    },

    async submitPasswordReset(
      payload: PasswordResetRequest,
    ): Promise<PasswordResetResult> {
      clearTransientErrors();
      const result = await authService.resetPassword(payload);

      if (result.success) {
        setState((current) => ({
          ...current,
          authBannerMessage: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.',
          authBannerTone: 'success',
          navigationState: openLoginRoute(current.navigationState),
        }));

        return result;
      }

      if (isReauthError(result.error)) {
        authStore.requireReauth(getReauthMessage(result.error));
        setState((current) => ({
          ...current,
          authBannerMessage: null,
          authBannerTone: 'info',
          navigationState: openLoginRoute(current.navigationState),
        }));
      }

      return result;
    },

    async submitRegister(
      payload: RegisterRequest,
    ): Promise<FormSubmissionResult> {
      clearTransientErrors();
      const registrationResult = await authService.registerMember(payload);

      if (!registrationResult.success) {
        return {
          success: false,
          error: registrationResult.error,
        };
      }

      const loginResult = await authService.startLoginFlow({
        email: payload.email,
        password: payload.password,
      });

      if (loginResult.success) {
        setState((current) => ({
          ...current,
          pendingMfa: {
            ...loginResult.challenge,
            source: 'register',
          },
          navigationState: openPendingMfaRoute(current.navigationState, loginResult.challenge),
        }));

        return {
          success: true,
        };
      }

      return {
        success: false,
        error: loginResult.error,
      };
    },

    async refreshProtectedSession(
      reason: 'manual' | 'resume' = 'manual',
    ): Promise<ProtectedRequestResult> {
      if (activeRefresh) {
        return activeRefresh;
      }

      setState({
        protectedErrorMessage: null,
        isRefreshingSession: true,
      });

      activeRefresh = (
        reason === 'resume'
          ? authService.revalidateSessionOnResume()
          : authService.refreshProtectedSession()
      )
        .then((result) => {
          applyProtectedRequestResult(result);
          return result;
        })
        .finally(() => {
          activeRefresh = null;
          setState({
            isRefreshingSession: false,
          });
        });

      return activeRefresh;
    },

    handleAppStateChange(nextState: AppStateStatus) {
      const previousState = appState;
      appState = nextState;

      if (
        (previousState === 'background' || previousState === 'inactive') &&
        nextState === 'active' &&
        authStore.getState().status === 'authenticated'
      ) {
        void this.refreshProtectedSession('resume');
      }
    },
  };
};
