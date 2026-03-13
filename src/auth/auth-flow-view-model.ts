import type { AppStateStatus } from 'react-native';

import {
  createAuthNavigationState,
  enterAuthenticatedApp,
  openForgotPasswordRoute,
  openLoginRoute,
  openMfaRecoveryRebindRoute,
  openMfaRecoveryRoute,
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
  MemberTotpRebindRequest,
  MfaRecoveryRebindConfirmRequest,
  TotpRebindBootstrap,
  PasswordForgotRequest,
  MfaRecoveryRebindRequest,
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
  MfaRecoveryRebindConfirmationResult,
  PasswordForgotResult,
  PasswordRecoveryChallengeResult,
  PasswordResetResult,
  ProtectedRequestResult,
  TotpRebindBootstrapResult,
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
  email?: string;
}

export interface MfaRecoveryState {
  suggestedEmail: string;
  recoveryProof: string | null;
  recoveryProofExpiresInSeconds: number | null;
  bootstrap: TotpRebindBootstrap | null;
}

export interface AuthStoreAdapter {
  getState: () => AuthState;
  initialize: (member: AuthState['member']) => void;
  login: (member: NonNullable<AuthState['member']>) => void;
  logout: () => void;
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
  bootstrapAuthenticatedTotpRebind: (
    payload: MemberTotpRebindRequest,
  ) => Promise<TotpRebindBootstrapResult>;
  bootstrapRecoveryTotpRebind: (
    payload: MfaRecoveryRebindRequest,
  ) => Promise<TotpRebindBootstrapResult>;
  confirmMfaRecoveryRebind: (
    payload: MfaRecoveryRebindConfirmRequest,
  ) => Promise<MfaRecoveryRebindConfirmationResult>;
  refreshProtectedSession: () => Promise<ProtectedRequestResult>;
  revalidateSessionOnResume: () => Promise<ProtectedRequestResult>;
}

export interface AuthFlowViewState {
  authBannerMessage: string | null;
  authBannerTone: 'info' | 'error' | 'success';
  navigationState: AuthNavigationState;
  pendingMfa: PendingMfaState | null;
  mfaRecovery: MfaRecoveryState | null;
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
  mfaRecovery: null,
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
    || navigationState.authRoute === 'mfaRecovery'
    || navigationState.authRoute === 'mfaRecoveryRebind'
  );

const createMfaRecoveryState = (
  current: MfaRecoveryState | null,
  overrides?: {
    suggestedEmail?: string;
    recoveryProof?: string | null;
    recoveryProofExpiresInSeconds?: number | null;
    bootstrap?: TotpRebindBootstrap | null;
  },
): MfaRecoveryState => ({
  suggestedEmail: overrides?.suggestedEmail ?? current?.suggestedEmail ?? '',
  recoveryProof:
    overrides && Object.hasOwn(overrides, 'recoveryProof')
      ? overrides.recoveryProof ?? null
      : current?.recoveryProof ?? null,
  recoveryProofExpiresInSeconds:
    overrides && Object.hasOwn(overrides, 'recoveryProofExpiresInSeconds')
      ? overrides.recoveryProofExpiresInSeconds ?? null
      : current?.recoveryProofExpiresInSeconds ?? null,
  bootstrap:
    overrides && Object.hasOwn(overrides, 'bootstrap')
      ? overrides.bootstrap ?? null
      : current?.bootstrap ?? null,
});

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
        mfaRecovery: null,
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
        mfaRecovery: null,
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
        mfaRecovery: null,
        navigationState: openLoginRoute(current.navigationState),
      }));
    },

    openRegister() {
      clearTransientErrors();
      setState((current) => ({
        ...current,
        pendingMfa: null,
        mfaRecovery: null,
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
        mfaRecovery: null,
        navigationState: openResetPasswordRoute(current.navigationState, token),
      }));
    },

    ingestPasswordResetToken(token: string) {
      clearTransientErrors();
      setState((current) => ({
        ...current,
        pendingMfa: null,
        mfaRecovery: null,
        navigationState: openResetPasswordRoute(current.navigationState, token),
      }));
    },

    openAuthenticatedMfaRecovery() {
      clearTransientErrors();
      const memberEmail = authStore.getState().member?.email?.trim() ?? '';

      setState((current) => ({
        ...current,
        pendingMfa: null,
        mfaRecovery: createMfaRecoveryState(current.mfaRecovery, {
          suggestedEmail: memberEmail || (current.mfaRecovery?.suggestedEmail ?? ''),
          recoveryProof: null,
          recoveryProofExpiresInSeconds: null,
          bootstrap: null,
        }),
        navigationState: openMfaRecoveryRoute(current.navigationState),
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
            email: payload.email.trim(),
          },
          mfaRecovery: null,
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
        mfaRecovery: null,
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
          mfaRecovery: null,
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

      if (presentation.navigateToRecovery) {
        const recoveryEmail = state.pendingMfa?.email?.trim() ?? '';

        setState((current) => ({
          ...current,
          pendingMfa: null,
          mfaRecovery: createMfaRecoveryState(current.mfaRecovery, {
            suggestedEmail: recoveryEmail,
            bootstrap: null,
          }),
          navigationState: openMfaRecoveryRoute(current.navigationState),
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
            mfaRecovery: null,
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
          mfaRecovery: null,
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
          mfaRecovery: null,
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
        if (result.continuation.recoveryProof) {
          setState((current) => ({
            ...current,
            authBannerMessage: null,
            authBannerTone: 'info',
            mfaRecovery: createMfaRecoveryState(current.mfaRecovery, {
              recoveryProof: result.continuation.recoveryProof ?? null,
              recoveryProofExpiresInSeconds:
                result.continuation.recoveryProofExpiresInSeconds ?? null,
              bootstrap: null,
            }),
            navigationState: openMfaRecoveryRoute(current.navigationState),
          }));
        } else {
          setState((current) => ({
            ...current,
            authBannerMessage: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.',
            authBannerTone: 'success',
            mfaRecovery: null,
            navigationState: openLoginRoute(current.navigationState),
          }));
        }

        return result;
      }

      if (isReauthError(result.error)) {
        authStore.requireReauth(getReauthMessage(result.error));
        setState((current) => ({
          ...current,
          authBannerMessage: null,
          authBannerTone: 'info',
          mfaRecovery: null,
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
            email: payload.email.trim(),
          },
          mfaRecovery: null,
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

    async bootstrapAuthenticatedMfaRecovery(
      payload: MemberTotpRebindRequest,
    ): Promise<TotpRebindBootstrapResult> {
      clearTransientErrors();
      const result = await authService.bootstrapAuthenticatedTotpRebind(payload);

      if (result.success) {
        setState((current) => ({
          ...current,
          pendingMfa: null,
          mfaRecovery: createMfaRecoveryState(current.mfaRecovery, {
            suggestedEmail:
              current.mfaRecovery?.suggestedEmail
              || authStore.getState().member?.email?.trim()
              || '',
            recoveryProof: null,
            recoveryProofExpiresInSeconds: null,
            bootstrap: result.bootstrap,
          }),
          navigationState: openMfaRecoveryRebindRoute(current.navigationState),
        }));
      }

      return result;
    },

    async bootstrapRecoveryMfaRecovery(): Promise<TotpRebindBootstrapResult> {
      clearTransientErrors();
      const recoveryProof = state.mfaRecovery?.recoveryProof?.trim() ?? '';

      if (!recoveryProof) {
        return {
          success: false,
          error: new Error('No recovery proof is available.'),
        };
      }

      const result = await authService.bootstrapRecoveryTotpRebind({
        recoveryProof,
      });

      if (result.success) {
        setState((current) => ({
          ...current,
          pendingMfa: null,
          mfaRecovery: createMfaRecoveryState(current.mfaRecovery, {
            bootstrap: result.bootstrap,
          }),
          navigationState: openMfaRecoveryRebindRoute(current.navigationState),
        }));
      }

      return result;
    },

    restartMfaRecovery() {
      clearTransientErrors();
      setState((current) => ({
        ...current,
        pendingMfa: null,
        mfaRecovery: createMfaRecoveryState(current.mfaRecovery, {
          suggestedEmail:
            current.mfaRecovery?.suggestedEmail
            || authStore.getState().member?.email?.trim()
            || '',
          recoveryProof: null,
          recoveryProofExpiresInSeconds: null,
          bootstrap: null,
        }),
        navigationState: openMfaRecoveryRoute(current.navigationState),
      }));
    },

    async submitMfaRecoveryRebindConfirmation(
      payload: MfaRecoveryRebindConfirmRequest,
    ): Promise<MfaRecoveryRebindConfirmationResult> {
      clearTransientErrors();
      const result = await authService.confirmMfaRecoveryRebind(payload);

      if (result.success && result.response.rebindCompleted) {
        authStore.logout();
        setState((current) => ({
          ...current,
          pendingMfa: null,
          mfaRecovery: null,
          authBannerMessage: '새 authenticator 등록이 완료되었습니다. 새 비밀번호와 현재 인증 코드로 다시 로그인해 주세요.',
          authBannerTone: 'success',
          navigationState: openLoginRoute(current.navigationState),
        }));
      }

      return result;
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
