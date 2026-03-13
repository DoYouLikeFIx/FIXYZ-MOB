import type { AppBootstrapRuntime } from '../bootstrap/app-bootstrap';
import { bootstrapAppSession } from '../bootstrap/app-bootstrap';
import type { CsrfTokenManager } from '../network/csrf';
import type {
  LoginRequest,
  MemberTotpRebindRequest,
  MfaRecoveryRebindConfirmRequest,
  PasswordForgotRequest,
  PasswordRecoveryChallengeRequest,
  PasswordResetRequest,
  RegisterRequest,
  MfaRecoveryRebindRequest,
  TotpEnrollmentConfirmationRequest,
  TotpEnrollmentRequest,
  TotpVerificationRequest,
} from '../types/auth';
import type {
  AuthMutationResult,
  BootstrapResult,
  LoginPhaseResult,
  MfaRecoveryRebindConfirmationResult,
  PasswordForgotResult,
  PasswordRecoveryChallengeResult,
  PasswordResetResult,
  ProtectedRequestResult,
  TotpRebindBootstrapResult,
  TotpEnrollmentBootstrapResult,
} from '../types/auth-ui';

import type { AuthApi } from '../api/auth-api';

import { isReauthError } from './auth-errors';

export type { AuthApi } from '../api/auth-api';

interface CreateMobileAuthServiceInput {
  authApi: AuthApi;
  csrfManager?: Pick<CsrfTokenManager, 'onForegroundResume'>;
  appBootstrap?: AppBootstrapRuntime;
}

export const createMobileAuthService = ({
  authApi,
  csrfManager,
  appBootstrap,
}: CreateMobileAuthServiceInput) => ({
  async bootstrap(): Promise<BootstrapResult> {
    if (appBootstrap) {
      try {
        await bootstrapAppSession(appBootstrap);
      } catch (error) {
        return {
          recoveredSession: false,
          member: null,
          error,
        };
      }
    }

    try {
      const member = await authApi.fetchSession();

      return {
        recoveredSession: true,
        member,
        error: null,
      };
    } catch (error) {
      return {
        recoveredSession: false,
        member: null,
        error,
      };
    }
  },

  async startLoginFlow(
    values: LoginRequest,
  ): Promise<LoginPhaseResult> {
    try {
      const challenge = await authApi.startLoginFlow(values);

      return {
        success: true,
        challenge,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  },

  async verifyLoginOtp(
    payload: TotpVerificationRequest,
  ): Promise<AuthMutationResult> {
    try {
      const member = await authApi.verifyLoginOtp(payload);

      return {
        success: true,
        member,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  },

  async registerMember(
    values: RegisterRequest,
  ): Promise<AuthMutationResult> {
    try {
      const member = await authApi.registerMember(values);

      return {
        success: true,
        member,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  },

  async beginTotpEnrollment(
    payload: TotpEnrollmentRequest,
  ): Promise<TotpEnrollmentBootstrapResult> {
    try {
      const enrollment = await authApi.beginTotpEnrollment(payload);

      return {
        success: true,
        enrollment,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  },

  async confirmTotpEnrollment(
    payload: TotpEnrollmentConfirmationRequest,
  ): Promise<AuthMutationResult> {
    try {
      const member = await authApi.confirmTotpEnrollment(payload);

      return {
        success: true,
        member,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  },

  async refreshProtectedSession(): Promise<ProtectedRequestResult> {
    try {
      const member = await authApi.fetchSession();

      return {
        status: 'authenticated',
        member,
      };
    } catch (error) {
      return isReauthError(error)
        ? {
            status: 'reauth',
            error,
          }
        : {
            status: 'error',
            error,
          };
    }
  },

  async requestPasswordResetEmail(
    payload: PasswordForgotRequest,
  ): Promise<PasswordForgotResult> {
    try {
      const response = await authApi.requestPasswordResetEmail(payload);

      return {
        success: true,
        response,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  },

  async requestPasswordRecoveryChallenge(
    payload: PasswordRecoveryChallengeRequest,
  ): Promise<PasswordRecoveryChallengeResult> {
    try {
      const challenge = await authApi.requestPasswordRecoveryChallenge(payload);

      return {
        success: true,
        challenge,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  },

  async resetPassword(
    payload: PasswordResetRequest,
  ): Promise<PasswordResetResult> {
    try {
      const continuation = await authApi.resetPassword(payload);

      return {
        success: true,
        continuation,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  },

  async bootstrapAuthenticatedTotpRebind(
    payload: MemberTotpRebindRequest,
  ): Promise<TotpRebindBootstrapResult> {
    try {
      const bootstrap = await authApi.bootstrapAuthenticatedTotpRebind(payload);

      return {
        success: true,
        bootstrap,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  },

  async bootstrapRecoveryTotpRebind(
    payload: MfaRecoveryRebindRequest,
  ): Promise<TotpRebindBootstrapResult> {
    try {
      const bootstrap = await authApi.bootstrapRecoveryTotpRebind(payload);

      return {
        success: true,
        bootstrap,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  },

  async confirmMfaRecoveryRebind(
    payload: MfaRecoveryRebindConfirmRequest,
  ): Promise<MfaRecoveryRebindConfirmationResult> {
    try {
      const response = await authApi.confirmMfaRecoveryRebind(payload);

      return {
        success: true,
        response,
      };
    } catch (error) {
      return {
        success: false,
        error,
      };
    }
  },

  async revalidateSessionOnResume(): Promise<ProtectedRequestResult> {
    if (csrfManager) {
      try {
        await csrfManager.onForegroundResume();
      } catch {
        // Resume revalidation should still verify the server session even when CSRF refresh fails.
      }
    }

    return this.refreshProtectedSession();
  },
});
