import type { AppStateStatus } from 'react-native';

import {
  createAuthNavigationState,
  enterAuthenticatedApp,
  openLoginRoute,
  openRegisterRoute,
  requireReauthRoute,
  type AuthNavigationState,
} from '../navigation/auth-navigation';
import type { AuthState } from '../store/auth-store';
import type {
  LoginRequest,
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
  refreshProtectedSession: () => Promise<ProtectedRequestResult>;
  revalidateSessionOnResume: () => Promise<ProtectedRequestResult>;
}

export interface AuthFlowViewState {
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
  navigationState,
  bootstrapErrorMessage: null,
  protectedErrorMessage: null,
  isRefreshingSession: false,
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
        navigationState: result.recoveredSession
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
