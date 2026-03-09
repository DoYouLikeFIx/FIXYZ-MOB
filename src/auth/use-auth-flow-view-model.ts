import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import type { AppBootstrapRuntime } from '../bootstrap/app-bootstrap';
import { authStore, useAuthStore } from '../store/auth-store';
import type { LoginRequest, RegisterRequest } from '../types/auth';

import {
  createAuthFlowViewModel,
} from './auth-flow-view-model';
import {
  createMobileAuthService,
  type AuthApi,
} from './mobile-auth-service';
import type { CsrfTokenManager } from '../network/csrf';

interface UseAuthFlowViewModelInput {
  authApi: AuthApi;
  csrfManager?: Pick<CsrfTokenManager, 'onForegroundResume'>;
  appBootstrap?: AppBootstrapRuntime;
}

export const useAuthFlowViewModel = ({
  authApi,
  csrfManager,
  appBootstrap,
}: UseAuthFlowViewModelInput) => {
  const viewModelRef = useRef<ReturnType<typeof createAuthFlowViewModel> | null>(null);

  if (viewModelRef.current === null) {
    viewModelRef.current = createAuthFlowViewModel({
      authService: createMobileAuthService({
        authApi,
        csrfManager,
        appBootstrap,
      }),
      authStore,
      initialAppState: AppState.currentState,
    });
  }

  const viewState = useSyncExternalStore(
    viewModelRef.current.subscribe,
    viewModelRef.current.getState,
    viewModelRef.current.getState,
  );

  const authStatus = useAuthStore((state) => state.status);
  const member = useAuthStore((state) => state.member);
  const reauthMessage = useAuthStore((state) => state.reauthMessage);

  useEffect(() => {
    void viewModelRef.current?.bootstrap();

    const subscription = AppState.addEventListener('change', (nextState) => {
      viewModelRef.current?.handleAppStateChange(nextState);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return {
    authStatus,
    member,
    reauthMessage,
    ...viewState,
    onOpenLogin: () => {
      viewModelRef.current?.openLogin();
    },
    onOpenRegister: () => {
      viewModelRef.current?.openRegister();
    },
    onLoginSubmit: (payload: LoginRequest) =>
      viewModelRef.current!.submitLogin(payload),
    onRegisterSubmit: (payload: RegisterRequest) =>
      viewModelRef.current!.submitRegister(payload),
    onRefreshProtectedSession: () => {
      void viewModelRef.current?.refreshProtectedSession('manual');
    },
  };
};
