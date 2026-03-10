import type { AppStateStatus } from 'react-native';

import {
  createAuthNavigationState,
  enterAuthenticatedApp,
  openForgotPasswordRoute,
  openLoginRoute,
  openResetPasswordRoute,
  openRegisterRoute,
  requireReauthRoute,
  type AuthNavigationState,
} from '../navigation/auth-navigation';
import type { AuthState } from '../store/auth-store';
import type {
  LoginRequest,
  PasswordForgotRequest,
  PasswordRecoveryChallengeRequest,
  PasswordResetRequest,
  RegisterRequest,
} from '../types/auth';

import {
  getAuthErrorMessage,
  getReauthMessage,
  isReauthError,
} from './auth-errors';
import type {
  AuthMutationResult,
  BootstrapResult,
  PasswordForgotResult,
  PasswordRecoveryChallengeResult,
  PasswordResetResult,
  ProtectedRequestResult,
} from './mobile-auth-service';

type Listener = () => void;

interface AuthStoreAdapter {
  getState: () => AuthState;
  initialize: (member: AuthState['member']) => void;
  login: (member: NonNullable<AuthState['member']>) => void;
  requireReauth: (message: string) => void;
  clearReauthMessage: () => void;
}

interface AuthServiceAdapter {
  bootstrap: () => Promise<BootstrapResult>;
  loginMember: (payload: LoginRequest) => Promise<AuthMutationResult>;
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

  const applyProtectedRequestResult = (
    result: ProtectedRequestResult,
  ) => {
    if (result.status === 'authenticated') {
      authStore.login(result.member);
      setState((current) => ({
        ...current,
        navigationState: enterAuthenticatedApp(current.navigationState),
        protectedErrorMessage: null,
      }));

      return;
    }

    if (result.status === 'reauth') {
      authStore.requireReauth(getReauthMessage(result.error));
      setState((current) => ({
        ...current,
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
        navigationState: openLoginRoute(current.navigationState),
      }));
    },

    openRegister() {
      clearTransientErrors();
      setState((current) => ({
        ...current,
        navigationState: openRegisterRoute(current.navigationState),
      }));
    },

    openForgotPassword() {
      clearTransientErrors();
      setState((current) => ({
        ...current,
        navigationState: openForgotPasswordRoute(current.navigationState),
      }));
    },

    openResetPassword(token?: string) {
      clearTransientErrors();
      setState((current) => ({
        ...current,
        navigationState: openResetPasswordRoute(current.navigationState, token),
      }));
    },

    ingestPasswordResetToken(token: string) {
      clearTransientErrors();
      setState((current) => ({
        ...current,
        navigationState: openResetPasswordRoute(current.navigationState, token),
      }));
    },

    async submitLogin(
      payload: LoginRequest,
    ): Promise<AuthMutationResult> {
      clearTransientErrors();
      const result = await authService.loginMember(payload);

      if (result.success) {
        authStore.login(result.member);
        setState((current) => ({
          ...current,
          navigationState: enterAuthenticatedApp(current.navigationState, {
            source: 'login',
          }),
        }));
      }

      return result;
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
    ): Promise<AuthMutationResult> {
      clearTransientErrors();
      const result = await authService.registerMember(payload);

      if (result.success) {
        authStore.login(result.member);
        setState((current) => ({
          ...current,
          navigationState: enterAuthenticatedApp(current.navigationState, {
            source: 'register',
          }),
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
