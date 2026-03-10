import type { CsrfTokenManager } from '../network/csrf';
import type { HttpClient } from '../network/http-client';
import type {
  LoginRequest,
  Member,
  PasswordForgotRequest,
  PasswordForgotResponse,
  PasswordRecoveryChallengeRequest,
  PasswordRecoveryChallengeResponse,
  PasswordResetRequest,
  RegisterRequest,
} from '../types/auth';

interface AuthMutationResponse {
  memberId?: number;
  memberUuid?: string;
  email: string;
  name: string;
  role?: string;
  totpEnrolled?: boolean;
  accountId?: string | null;
}

const isMember = (value: unknown): value is Member =>
  typeof value === 'object'
  && value !== null
  && 'memberUuid' in value
  && 'email' in value
  && 'name' in value
  && 'role' in value
  && 'totpEnrolled' in value;

const createFormBody = (payload: Record<string, string>) =>
  new URLSearchParams(payload).toString();

const FORM_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
};

const createCompatMember = (payload: AuthMutationResponse): Member => ({
  memberUuid: payload.memberUuid ?? String(payload.memberId ?? ''),
  email: payload.email,
  name: payload.name,
  role: payload.role ?? 'ROLE_USER',
  totpEnrolled: payload.totpEnrolled ?? false,
  accountId: payload.accountId ?? undefined,
});

export interface AuthApi {
  fetchSession: () => Promise<Member>;
  loginMember: (payload: LoginRequest) => Promise<Member>;
  registerMember: (payload: RegisterRequest) => Promise<Member>;
  requestPasswordResetEmail: (payload: PasswordForgotRequest) => Promise<PasswordForgotResponse>;
  requestPasswordRecoveryChallenge: (
    payload: PasswordRecoveryChallengeRequest,
  ) => Promise<PasswordRecoveryChallengeResponse>;
  resetPassword: (payload: PasswordResetRequest) => Promise<void>;
}

interface CreateAuthApiInput {
  client: Pick<HttpClient, 'get' | 'post'>;
  csrfManager?: Pick<CsrfTokenManager, 'onLoginSuccess'>;
}

export const createAuthApi = ({
  client,
  csrfManager,
}: CreateAuthApiInput): AuthApi => ({
  fetchSession: async () => {
    const response = await client.get<Member>('/api/v1/auth/session');
    return response.body;
  },
  loginMember: async (payload) => {
    const response = await client.post<Member | AuthMutationResponse>(
      '/api/v1/auth/login',
      createFormBody({
        email: payload.email,
        password: payload.password,
      }),
      {
        headers: FORM_HEADERS,
      },
    );

    if (csrfManager) {
      await csrfManager.onLoginSuccess();
    }

    if (isMember(response.body)) {
      return response.body;
    }

    const sessionResponse = await client.get<Member>('/api/v1/auth/session');
    return sessionResponse.body;
  },
  registerMember: async (payload) => {
    const response = await client.post<Member | AuthMutationResponse>(
      '/api/v1/auth/register',
      createFormBody({
        email: payload.email,
        password: payload.password,
        name: payload.name,
      }),
      {
        headers: FORM_HEADERS,
      },
    );
    if (isMember(response.body)) {
      return response.body;
    }

    return createCompatMember(response.body);
  },
  requestPasswordResetEmail: async (payload) => {
    const response = await client.post<PasswordForgotResponse>(
      '/api/v1/auth/password/forgot',
      payload,
    );

    return response.body;
  },
  requestPasswordRecoveryChallenge: async (payload) => {
    const response = await client.post<PasswordRecoveryChallengeResponse>(
      '/api/v1/auth/password/forgot/challenge',
      payload,
    );

    return response.body;
  },
  resetPassword: async (payload) => {
    await client.post('/api/v1/auth/password/reset', payload);
  },
});
