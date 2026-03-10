import {
  createMobileAuthService,
  type AuthApi,
} from '@/auth/mobile-auth-service';
import type { HealthClient } from '@/network/health';
import type { CsrfTokenManager } from '@/network/csrf';
import type { NormalizedHttpError } from '@/network/types';

const createHttpError = (
  overrides: Partial<NormalizedHttpError> & { message?: string } = {},
): NormalizedHttpError => {
  const error = new Error(
    overrides.message ?? 'Unexpected server response. Please try again.',
  ) as NormalizedHttpError;

  error.name = 'MobHttpClientError';
  error.code = overrides.code;
  error.status = overrides.status;
  error.detail = overrides.detail;
  error.retriable = overrides.retriable;

  return error;
};

describe('mobile auth service', () => {
  const authApi: AuthApi = {
    fetchSession: vi.fn(),
    loginMember: vi.fn(),
    registerMember: vi.fn(),
    requestPasswordResetEmail: vi.fn(),
    requestPasswordRecoveryChallenge: vi.fn(),
    resetPassword: vi.fn(),
  };

  const csrfManager = {
    onAppColdStart: vi.fn(async () => {}),
    onForegroundResume: vi.fn(async () => {}),
  } as Pick<CsrfTokenManager, 'onAppColdStart' | 'onForegroundResume'>;

  const healthClient = {
    get: vi.fn(async () => ({
      statusCode: 200,
      body: { status: 'UP' },
    })),
  } as HealthClient;

  const service = createMobileAuthService({
    authApi,
    csrfManager,
    appBootstrap: {
      baseUrl: 'http://localhost:8080',
      client: healthClient,
      csrfManager,
      strictCsrfBootstrap: false,
    },
  });

  beforeEach(() => {
    vi.mocked(authApi.fetchSession).mockReset();
    vi.mocked(authApi.loginMember).mockReset();
    vi.mocked(authApi.registerMember).mockReset();
    vi.mocked(authApi.requestPasswordResetEmail).mockReset();
    vi.mocked(authApi.requestPasswordRecoveryChallenge).mockReset();
    vi.mocked(authApi.resetPassword).mockReset();
    vi.mocked(csrfManager.onAppColdStart).mockClear();
    vi.mocked(csrfManager.onForegroundResume).mockClear();
    vi.mocked(healthClient.get).mockClear();
    vi.mocked(healthClient.get).mockResolvedValue({
      statusCode: 200,
      body: { status: 'UP' },
    });
  });

  it('performs cold-start csrf bootstrap and health check before session recovery', async () => {
    vi.mocked(authApi.fetchSession).mockResolvedValue({
      memberUuid: 'member-001',
      email: 'demo@fix.com',
      name: 'Demo User',
      role: 'ROLE_USER',
      totpEnrolled: false,
    });

    const result = await service.bootstrap();

    expect(vi.mocked(csrfManager.onAppColdStart)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(healthClient.get)).toHaveBeenCalledWith(
      '/actuator/health',
      expect.objectContaining({
        timeoutMs: expect.any(Number),
      }),
    );
    expect(result).toMatchObject({
      recoveredSession: true,
      member: {
        email: 'demo@fix.com',
      },
      error: null,
    });
  });

  it('surfaces cold-start bootstrap failures before session recovery', async () => {
    const error = createHttpError({
      code: 'SYS-001',
      status: 500,
      message: 'Bootstrap failed',
    });
    vi.mocked(csrfManager.onAppColdStart).mockRejectedValue(error);

    const result = await service.bootstrap();

    expect(result).toEqual({
      recoveredSession: false,
      member: null,
      error,
    });
    expect(vi.mocked(authApi.fetchSession)).not.toHaveBeenCalled();
  });

  it('returns the authenticated member when login succeeds', async () => {
    vi.mocked(authApi.loginMember).mockResolvedValue({
      memberUuid: 'member-001',
      email: 'demo@fix.com',
      name: 'Demo User',
      role: 'ROLE_USER',
      totpEnrolled: false,
    });

    const result = await service.loginMember({
      email: 'demo@fix.com',
      password: 'Test1234!',
    });

    expect(result).toMatchObject({
      success: true,
      member: {
        email: 'demo@fix.com',
      },
    });
  });

  it('returns the raw error when login fails', async () => {
    const error = createHttpError({
      code: 'AUTH-001',
      status: 401,
      message: 'Credential mismatch',
    });
    vi.mocked(authApi.loginMember).mockRejectedValue(error);

    const result = await service.loginMember({
      email: 'demo@fix.com',
      password: 'wrong-password',
    });

    expect(result).toEqual({
      success: false,
      error,
    });
  });

  it('registers then logs in with email for the follow-up session', async () => {
    vi.mocked(authApi.registerMember).mockResolvedValue({
      memberUuid: 'member-002',
      email: 'new@fix.com',
      name: 'New User',
      role: 'ROLE_USER',
      totpEnrolled: false,
    });
    vi.mocked(authApi.loginMember).mockResolvedValue({
      memberUuid: 'member-002',
      email: 'new@fix.com',
      name: 'New User',
      role: 'ROLE_USER',
      totpEnrolled: false,
    });

    const result = await service.registerMember({
      email: 'new@fix.com',
      name: 'New User',
      password: 'Test1234!',
    });

    expect(result).toMatchObject({
      success: true,
      member: {
        email: 'new@fix.com',
      },
    });
    expect(vi.mocked(authApi.loginMember)).toHaveBeenCalledWith({
      email: 'new@fix.com',
      password: 'Test1234!',
    });
  });

  it('classifies protected-session failures into deterministic reauth', async () => {
    const error = createHttpError({
      code: 'AUTH-003',
      status: 401,
      message: 'Authentication required',
    });
    vi.mocked(authApi.fetchSession).mockRejectedValue(error);

    const result = await service.refreshProtectedSession();

    expect(result).toEqual({
      status: 'reauth',
      error,
    });
  });

  it('refreshes csrf state before resume revalidation', async () => {
    vi.mocked(authApi.fetchSession).mockResolvedValue({
      memberUuid: 'member-001',
      email: 'demo@fix.com',
      name: 'Demo User',
      role: 'ROLE_USER',
      totpEnrolled: false,
    });

    const result = await service.revalidateSessionOnResume();

    expect(vi.mocked(csrfManager.onForegroundResume)).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'authenticated',
      member: {
        email: 'demo@fix.com',
      },
    });
  });

  it('returns the forgot-password response when the recovery request succeeds', async () => {
    vi.mocked(authApi.requestPasswordResetEmail).mockResolvedValue({
      accepted: true,
      message: 'If the account is eligible, a reset email will be sent.',
      recovery: {
        challengeEndpoint: '/api/v1/auth/password/forgot/challenge',
        challengeMayBeRequired: true,
      },
    });

    await expect(
      service.requestPasswordResetEmail({
        email: 'demo@fix.com',
      }),
    ).resolves.toEqual({
      success: true,
      response: {
        accepted: true,
        message: 'If the account is eligible, a reset email will be sent.',
        recovery: {
          challengeEndpoint: '/api/v1/auth/password/forgot/challenge',
          challengeMayBeRequired: true,
        },
      },
    });
  });

  it('returns challenge metadata for the recovery bootstrap flow', async () => {
    vi.mocked(authApi.requestPasswordRecoveryChallenge).mockResolvedValue({
      challengeToken: 'challenge-token',
      challengeType: 'captcha',
      challengeTtlSeconds: 300,
    });

    await expect(
      service.requestPasswordRecoveryChallenge({
        email: 'demo@fix.com',
      }),
    ).resolves.toEqual({
      success: true,
      challenge: {
        challengeToken: 'challenge-token',
        challengeType: 'captcha',
        challengeTtlSeconds: 300,
      },
    });
  });

  it('returns success when the password reset completes', async () => {
    vi.mocked(authApi.resetPassword).mockResolvedValue(undefined);

    await expect(
      service.resetPassword({
        token: 'reset-token',
        newPassword: 'Test1234!',
      }),
    ).resolves.toEqual({
      success: true,
    });
  });
});
