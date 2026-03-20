import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState, Linking } from 'react-native';

import type { AuthState } from '../store/auth-store';
import type {
  LoginRequest,
  MemberTotpRebindRequest,
  MfaRecoveryRebindConfirmRequest,
  PasswordForgotRequest,
  PasswordRecoveryChallengeRequest,
  PasswordResetRequest,
  RegisterRequest,
  TotpEnrollmentConfirmationRequest,
  TotpVerificationRequest,
} from '../types/auth';

import {
  type AuthServiceAdapter,
  type AuthStoreAdapter,
  createAuthFlowViewModel,
  type RestartMfaRecoveryOptions,
} from './auth-flow-view-model';
import { extractPasswordResetTokenFromUrl } from './password-reset-handoff';
import type { RecoveryChallengeFailClosedTelemetryEvent } from './recovery-challenge';

interface UseAuthFlowViewModelInput {
  authService: AuthServiceAdapter;
  authStore: AuthStoreAdapter & {
    subscribe: (listener: () => void) => () => void;
    getState: () => AuthState;
  };
}

export const useAuthFlowViewModel = ({
  authService,
  authStore,
}: UseAuthFlowViewModelInput) => {
  const viewModelRef = useRef<ReturnType<typeof createAuthFlowViewModel> | null>(null);

  if (viewModelRef.current === null) {
    viewModelRef.current = createAuthFlowViewModel({
      authService,
      authStore,
      initialAppState: AppState.currentState,
    });
  }

  const viewState = useSyncExternalStore(
    viewModelRef.current.subscribe,
    viewModelRef.current.getState,
    viewModelRef.current.getState,
  );

  const authState = useSyncExternalStore(
    authStore.subscribe,
    authStore.getState,
    authStore.getState,
  );

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
    authStatus: authState.status,
    member: authState.member,
    reauthMessage: authState.reauthMessage,
    ...viewState,
    onOpenLogin: () => {
      viewModelRef.current?.openLogin();
    },
    onRequireEnrollmentRestart: (message: string) => {
      viewModelRef.current?.requireEnrollmentRestart(message);
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
    onOpenAuthenticatedMfaRecovery: () => {
      viewModelRef.current?.openAuthenticatedMfaRecovery();
    },
    onLoginSubmit: (payload: LoginRequest) =>
      viewModelRef.current!.submitLogin(payload),
    onLoginMfaSubmit: (payload: TotpVerificationRequest) =>
      viewModelRef.current!.submitLoginMfa(payload),
    onRegisterSubmit: (payload: RegisterRequest) =>
      viewModelRef.current!.submitRegister(payload),
    onResetPendingMfa: () => {
      viewModelRef.current?.resetPendingMfa();
    },
    onLoadTotpEnrollment: () =>
      viewModelRef.current!.loadTotpEnrollment(),
    onSubmitTotpEnrollment: (payload: TotpEnrollmentConfirmationRequest) =>
      viewModelRef.current!.submitTotpEnrollmentConfirmation(payload),
    onPasswordForgotSubmit: (payload: PasswordForgotRequest) =>
      viewModelRef.current!.submitPasswordResetEmail(payload),
    onPasswordChallengeSubmit: (payload: PasswordRecoveryChallengeRequest) =>
      viewModelRef.current!.submitPasswordRecoveryChallenge(payload),
    onPasswordChallengeFailClosedTelemetry: (
      event: RecoveryChallengeFailClosedTelemetryEvent,
    ) => {
      void viewModelRef.current?.reportPasswordRecoveryChallengeFailClosed(event);
    },
    onPasswordResetSubmit: (payload: PasswordResetRequest) =>
      viewModelRef.current!.submitPasswordReset(payload),
    onAuthenticatedMfaRecoveryBootstrap: (payload: MemberTotpRebindRequest) =>
      viewModelRef.current!.bootstrapAuthenticatedMfaRecovery(payload),
    onRecoveryMfaRecoveryBootstrap: () =>
      viewModelRef.current!.bootstrapRecoveryMfaRecovery(),
    onRestartMfaRecovery: (options?: RestartMfaRecoveryOptions) => {
      viewModelRef.current?.restartMfaRecovery(options);
    },
    onSubmitMfaRecoveryRebind: (payload: MfaRecoveryRebindConfirmRequest) =>
      viewModelRef.current!.submitMfaRecoveryRebindConfirmation(payload),
    onRefreshProtectedSession: () => {
      void viewModelRef.current?.refreshProtectedSession('manual');
    },
  };
};
