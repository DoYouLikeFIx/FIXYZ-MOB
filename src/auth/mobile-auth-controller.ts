import type { CsrfTokenManager } from '../network/csrf';
import {
  enterAuthenticatedApp,
  openLoginRoute,
  openRegisterRoute,
  requireReauthRoute,
  type AuthNavigationState,
} from '../navigation/auth-navigation';
import type { AuthState } from '../store/auth-store';
import type { LoginRequest } from '../types/auth';
import type {
  LoginFormFeedback,
  RegisterFormFeedback,
  RegisterFormValues,
} from '../types/auth-ui';

import type { AuthApi } from '../api/auth-api';

import {
  getAuthErrorMessage,
  getLoginErrorFeedback,
  getReauthMessage,
  getRegisterErrorFeedback,
  isReauthError,
} from './auth-errors';
import {
  validateLoginForm,
  validateRegisterForm,
} from './form-validation';

export type { AuthApi } from '../api/auth-api';

interface AuthStoreAdapter {
  getState: () => AuthState;
  initialize: (member: AuthState['member']) => void;
  login: (member: NonNullable<AuthState['member']>) => void;
  requireReauth: (message: string) => void;
  clearReauthMessage: () => void;
}

interface CreateMobileAuthControllerInput {
  authApi: AuthApi;
  authStore: AuthStoreAdapter;
  csrfManager?: Pick<CsrfTokenManager, 'onForegroundResume'>;
  getNavigationState: () => AuthNavigationState;
  setNavigationState: (nextState: AuthNavigationState) => void;
}

export interface SubmissionResult<TFeedback> {
  success: boolean;
  feedback: TFeedback;
}

export interface ProtectedRequestResult {
  status: 'authenticated' | 'reauth' | 'error';
  errorMessage: string | null;
}

export interface BootstrapResult {
  recoveredSession: boolean;
  errorMessage: string | null;
}

export const createMobileAuthController = ({
  authApi,
  authStore,
  csrfManager,
  getNavigationState,
  setNavigationState,
}: CreateMobileAuthControllerInput) => {
  const handleProtectedSessionFailure = (error: unknown): ProtectedRequestResult => {
    if (isReauthError(error)) {
      authStore.requireReauth(getReauthMessage(error));
      setNavigationState(requireReauthRoute(getNavigationState()));

      return {
        status: 'reauth',
        errorMessage: null,
      };
    }

    return {
      status: 'error',
      errorMessage: getAuthErrorMessage(error),
    };
  };

  return {
    openLogin() {
      authStore.clearReauthMessage();
      setNavigationState(openLoginRoute(getNavigationState()));
    },

    openRegister() {
      authStore.clearReauthMessage();
      setNavigationState(openRegisterRoute(getNavigationState()));
    },

    async bootstrap(): Promise<BootstrapResult> {
      try {
        const member = await authApi.fetchSession();
        authStore.initialize(member);
        setNavigationState(
          enterAuthenticatedApp(getNavigationState(), {
            source: 'login',
          }),
        );

        return {
          recoveredSession: true,
          errorMessage: null,
        };
      } catch (error) {
        authStore.initialize(null);
        setNavigationState(openLoginRoute(getNavigationState()));

        return {
          recoveredSession: false,
          errorMessage: isReauthError(error) ? null : getAuthErrorMessage(error),
        };
      }
    },

    async submitLogin(
      values: LoginRequest,
    ): Promise<SubmissionResult<LoginFormFeedback>> {
      authStore.clearReauthMessage();
      const validation = validateLoginForm(values);

      if (!validation.valid) {
        return {
          success: false,
          feedback: validation.feedback,
        };
      }

      try {
        const member = await authApi.loginMember(validation.payload);
        authStore.login(member);
        setNavigationState(
          enterAuthenticatedApp(getNavigationState(), {
            source: 'login',
          }),
        );

        return {
          success: true,
          feedback: validation.feedback,
        };
      } catch (error) {
        return {
          success: false,
          feedback: getLoginErrorFeedback(error),
        };
      }
    },

    async submitRegister(
      values: RegisterFormValues,
    ): Promise<SubmissionResult<RegisterFormFeedback>> {
      authStore.clearReauthMessage();
      const validation = validateRegisterForm(values);

      if (!validation.valid) {
        return {
          success: false,
          feedback: validation.feedback,
        };
      }

      try {
        await authApi.registerMember(validation.payload);

        const member = await authApi.loginMember({
          username: validation.payload.username,
          password: validation.payload.password,
        });

        authStore.login(member);
        setNavigationState(
          enterAuthenticatedApp(getNavigationState(), {
            source: 'register',
          }),
        );

        return {
          success: true,
          feedback: validation.feedback,
        };
      } catch (error) {
        return {
          success: false,
          feedback: getRegisterErrorFeedback(error),
        };
      }
    },

    async refreshProtectedSession(): Promise<ProtectedRequestResult> {
      try {
        const member = await authApi.fetchSession();
        authStore.login(member);
        setNavigationState(enterAuthenticatedApp(getNavigationState()));

        return {
          status: 'authenticated',
          errorMessage: null,
        };
      } catch (error) {
        return handleProtectedSessionFailure(error);
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
  };
};
