import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState, Linking } from 'react-native';

import type { AppBootstrapRuntime } from '../bootstrap/app-bootstrap';
import { authStore, useAuthStore } from '../store/auth-store';
import type {
  LoginRequest,
  PasswordForgotRequest,
  PasswordRecoveryChallengeRequest,
  PasswordResetRequest,
  RegisterRequest,
} from '../types/auth';

import {
  createAuthFlowViewModel,
} from './auth-flow-view-model';
import { extractPasswordResetTokenFromUrl } from './password-reset-handoff';
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
    let cancelled = false;

    const initialize = async () => {
      const initialUrlPromise = Linking.getInitialURL();

      await viewModelRef.current?.bootstrap();

      if (cancelled) {
        return;
      }

      const token = extractPasswordResetTokenFromUrl(await initialUrlPromise);

      if (token) {
        viewModelRef.current?.ingestPasswordResetToken(token);
      }
    };

    void initialize();

    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      viewModelRef.current?.handleAppStateChange(nextState);
    });
    const linkingSubscription = Linking.addEventListener('url', ({ url }) => {
      const token = extractPasswordResetTokenFromUrl(url);

      if (token) {
        viewModelRef.current?.ingestPasswordResetToken(token);
      }
    });

    return () => {
      cancelled = true;
      appStateSubscription.remove();
      linkingSubscription.remove();
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
    onOpenForgotPassword: () => {
      viewModelRef.current?.openForgotPassword();
    },
    onOpenResetPassword: (token?: string) => {
      viewModelRef.current?.openResetPassword(token);
    },
    onLoginSubmit: (payload: LoginRequest) =>
      viewModelRef.current!.submitLogin(payload),
    onRegisterSubmit: (payload: RegisterRequest) =>
      viewModelRef.current!.submitRegister(payload),
    onPasswordForgotSubmit: (payload: PasswordForgotRequest) =>
      viewModelRef.current!.submitPasswordResetEmail(payload),
    onPasswordChallengeSubmit: (payload: PasswordRecoveryChallengeRequest) =>
      viewModelRef.current!.submitPasswordRecoveryChallenge(payload),
    onPasswordResetSubmit: (payload: PasswordResetRequest) =>
      viewModelRef.current!.submitPasswordReset(payload),
    onRefreshProtectedSession: () => {
      void viewModelRef.current?.refreshProtectedSession('manual');
    },
  };
};
