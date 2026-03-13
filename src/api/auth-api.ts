import type { CsrfTokenManager } from '../network/csrf';
import type { HttpClient } from '../network/http-client';
import type {
  LoginChallenge,
  LoginRequest,
  MemberTotpRebindRequest,
  Member,
  MfaRecoveryRebindConfirmRequest,
  MfaRecoveryRebindConfirmResponse,
  MfaRecoveryRebindRequest,
  PasswordForgotRequest,
  PasswordForgotResponse,
  PasswordResetContinuation,
  PasswordRecoveryChallengeRequest,
  PasswordRecoveryChallengeResponse,
  PasswordResetRequest,
  RegisterRequest,
  TotpRebindBootstrap,
  TotpEnrollmentBootstrap,
  TotpEnrollmentConfirmationRequest,
  TotpEnrollmentRequest,
  TotpVerificationRequest,
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
  startLoginFlow: (payload: LoginRequest) => Promise<LoginChallenge>;
  verifyLoginOtp: (payload: TotpVerificationRequest) => Promise<Member>;
  beginTotpEnrollment: (payload: TotpEnrollmentRequest) => Promise<TotpEnrollmentBootstrap>;
  confirmTotpEnrollment: (
    payload: TotpEnrollmentConfirmationRequest,
  ) => Promise<Member>;
  registerMember: (payload: RegisterRequest) => Promise<Member>;
  requestPasswordResetEmail: (payload: PasswordForgotRequest) => Promise<PasswordForgotResponse>;
  requestPasswordRecoveryChallenge: (
    payload: PasswordRecoveryChallengeRequest,
  ) => Promise<PasswordRecoveryChallengeResponse>;
  resetPassword: (payload: PasswordResetRequest) => Promise<PasswordResetContinuation>;
  bootstrapAuthenticatedTotpRebind: (
    payload: MemberTotpRebindRequest,
  ) => Promise<TotpRebindBootstrap>;
  bootstrapRecoveryTotpRebind: (
    payload: MfaRecoveryRebindRequest,
  ) => Promise<TotpRebindBootstrap>;
  confirmMfaRecoveryRebind: (
    payload: MfaRecoveryRebindConfirmRequest,
  ) => Promise<MfaRecoveryRebindConfirmResponse>;
}

interface CreateAuthApiInput {
  client: Pick<HttpClient, 'get' | 'post'>;
  csrfManager?: Pick<CsrfTokenManager, 'onLoginSuccess'>;
}

export const createAuthApi = ({
  client,
  csrfManager,
}: CreateAuthApiInput): AuthApi => ({
  resetPassword: async (payload) => {
    const response = await client.post('/api/v1/auth/password/reset', payload);
    const recoveryProof = response.headers.get('X-MFA-Recovery-Proof')?.trim() ?? '';
    const rawExpiresIn = response.headers.get('X-MFA-Recovery-Proof-Expires-In');
    const recoveryProofExpiresInSeconds = rawExpiresIn ? Number(rawExpiresIn) : undefined;

    return {
      recoveryProof: recoveryProof || undefined,
      recoveryProofExpiresInSeconds:
        recoveryProofExpiresInSeconds !== undefined && Number.isFinite(recoveryProofExpiresInSeconds)
          ? recoveryProofExpiresInSeconds
          : undefined,
    };
  },
  fetchSession: async () => {
    const response = await client.get<Member>('/api/v1/auth/session');
    return response.body;
  },
  startLoginFlow: async (payload) => {
    const response = await client.post<LoginChallenge>(
      '/api/v1/auth/login',
      createFormBody({
        email: payload.email,
        password: payload.password,
      }),
      {
        headers: FORM_HEADERS,
      },
    );

    return response.body;
  },

  verifyLoginOtp: async (payload) => {
    const response = await client.post<AuthMutationResponse>(
      '/api/v1/auth/otp/verify',
      payload,
    );

    if (csrfManager) {
      await csrfManager.onLoginSuccess();
    }

    return createCompatMember(response.body);
  },
  beginTotpEnrollment: async (payload) => {
    const response = await client.post<TotpEnrollmentBootstrap>(
      '/api/v1/members/me/totp/enroll',
      payload,
    );

    return response.body;
  },
  confirmTotpEnrollment: async (payload) => {
    const response = await client.post<AuthMutationResponse>(
      '/api/v1/members/me/totp/confirm',
      payload,
    );

    if (csrfManager) {
      await csrfManager.onLoginSuccess();
    }

    return createCompatMember(response.body);
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
    return isMember(response.body)
      ? response.body
      : createCompatMember(response.body);
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
  bootstrapAuthenticatedTotpRebind: async (payload) => {
    const response = await client.post<TotpRebindBootstrap>(
      '/api/v1/members/me/totp/rebind',
      payload,
    );

    return response.body;
  },
  bootstrapRecoveryTotpRebind: async (payload) => {
    const response = await client.post<TotpRebindBootstrap>(
      '/api/v1/auth/mfa-recovery/rebind',
      payload,
    );

    return response.body;
  },
  confirmMfaRecoveryRebind: async (payload) => {
    const response = await client.post<MfaRecoveryRebindConfirmResponse>(
      '/api/v1/auth/mfa-recovery/rebind/confirm',
      payload,
    );

    if (csrfManager) {
      await csrfManager.onLoginSuccess().catch(() => undefined);
    }

    return response.body;
  },
});
