import type { AppBootstrapRuntime } from '../bootstrap/app-bootstrap';
import { bootstrapAppSession } from '../bootstrap/app-bootstrap';
import type { CsrfTokenManager } from '../network/csrf';
import type {
  LoginRequest,
  Member,
  RegisterRequest,
} from '../types/auth';

import type { AuthApi } from '../api/auth-api';

import { isReauthError } from './auth-errors';

export type { AuthApi } from '../api/auth-api';

interface CreateMobileAuthServiceInput {
  authApi: AuthApi;
  csrfManager?: Pick<CsrfTokenManager, 'onForegroundResume'>;
  appBootstrap?: AppBootstrapRuntime;
}

export type AuthMutationResult =
  | {
      success: true;
      member: Member;
    }
  | {
      success: false;
      error: unknown;
    };

export type ProtectedRequestResult =
  | {
      status: 'authenticated';
      member: Member;
    }
  | {
      status: 'reauth';
      error: unknown;
    }
  | {
      status: 'error';
      error: unknown;
    };

export interface BootstrapResult {
  recoveredSession: boolean;
  member: Member | null;
  error: unknown | null;
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

  async loginMember(
    values: LoginRequest,
  ): Promise<AuthMutationResult> {
    try {
      const member = await authApi.loginMember(values);

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
      await authApi.registerMember(values);

      const member = await authApi.loginMember({
        email: values.email,
        password: values.password,
      });

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
