import { createAuthApi } from '@/api/auth-api';
import type { Member } from '@/types/auth';

const memberFixture: Member = {
  memberUuid: 'member-001',
  email: 'demo@fix.com',
  name: 'Demo User',
  role: 'ROLE_USER',
  totpEnrolled: false,
};

describe('auth api', () => {
  const client = {
    get: vi.fn(),
    post: vi.fn(),
  };

  const csrfManager = {
    onLoginSuccess: vi.fn(async () => {}),
  };

  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
    csrfManager.onLoginSuccess.mockClear();
  });

  it('fetches the current session from the mobile auth contract', async () => {
    client.get.mockResolvedValue({
      statusCode: 200,
      body: memberFixture,
    });

    const authApi = createAuthApi({ client });

    await expect(authApi.fetchSession()).resolves.toEqual(memberFixture);
    expect(client.get).toHaveBeenCalledWith('/api/v1/auth/session');
  });

  it('starts the password-only login challenge contract', async () => {
    client.post.mockResolvedValue({
      statusCode: 200,
      body: {
        loginToken: 'login-token',
        nextAction: 'VERIFY_TOTP',
        totpEnrolled: true,
        expiresAt: '2026-03-12T10:00:00Z',
      },
    });

    const authApi = createAuthApi({ client, csrfManager });

    await expect(
      authApi.startLoginFlow({
        email: 'demo@fix.com',
        password: 'Test1234!',
      }),
    ).resolves.toEqual({
      loginToken: 'login-token',
      nextAction: 'VERIFY_TOTP',
      totpEnrolled: true,
      expiresAt: '2026-03-12T10:00:00Z',
    });

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      'email=demo%40fix.com&password=Test1234%21',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    expect(csrfManager.onLoginSuccess).not.toHaveBeenCalled();
  });

  it('registers a member without forcing an immediate csrf refresh before follow-up login', async () => {
    client.post.mockResolvedValue({
      statusCode: 200,
      body: {
        memberId: 1,
        email: 'new@fix.com',
        name: 'New User',
      },
    });

    const authApi = createAuthApi({ client, csrfManager });

    await expect(
      authApi.registerMember({
        email: 'new@fix.com',
        name: 'New User',
        password: 'Test1234!',
      }),
    ).resolves.toEqual({
      memberUuid: '1',
      email: 'new@fix.com',
      name: 'New User',
      role: 'ROLE_USER',
      totpEnrolled: false,
    });

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/auth/register',
      'email=new%40fix.com&password=Test1234%21&name=New+User',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    expect(csrfManager.onLoginSuccess).not.toHaveBeenCalled();
  });

  it('verifies the submitted OTP and refreshes csrf bootstrap state for subsequent protected calls', async () => {
    client.post.mockResolvedValue({
      statusCode: 200,
      body: {
        memberId: 1,
        email: 'demo@fix.com',
        name: 'Demo User',
        totpEnrolled: true,
      },
    });

    const authApi = createAuthApi({ client, csrfManager });

    await expect(
      authApi.verifyLoginOtp({
        loginToken: 'login-token',
        otpCode: '123456',
      }),
    ).resolves.toEqual({
      memberUuid: '1',
      email: 'demo@fix.com',
      name: 'Demo User',
      role: 'ROLE_USER',
      totpEnrolled: true,
      accountId: undefined,
    });

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/auth/otp/verify',
      {
        loginToken: 'login-token',
        otpCode: '123456',
      },
    );
    expect(csrfManager.onLoginSuccess).toHaveBeenCalledTimes(1);
  });

  it('bootstraps TOTP enrollment with the pending login token', async () => {
    client.post.mockResolvedValue({
      statusCode: 200,
      body: {
        qrUri: 'otpauth://totp/FIX:demo@fix.com?secret=ABC123',
        manualEntryKey: 'ABC123',
        enrollmentToken: 'enrollment-token',
        expiresAt: '2026-03-12T10:05:00Z',
      },
    });

    const authApi = createAuthApi({ client, csrfManager });

    await expect(
      authApi.beginTotpEnrollment({
        loginToken: 'login-token',
      }),
    ).resolves.toEqual({
      qrUri: 'otpauth://totp/FIX:demo@fix.com?secret=ABC123',
      manualEntryKey: 'ABC123',
      enrollmentToken: 'enrollment-token',
      expiresAt: '2026-03-12T10:05:00Z',
    });

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/members/me/totp/enroll',
      {
        loginToken: 'login-token',
      },
    );
  });

  it('confirms TOTP enrollment and refreshes csrf bootstrap state for the new session', async () => {
    client.post.mockResolvedValue({
      statusCode: 200,
      body: {
        memberId: 1,
        email: 'demo@fix.com',
        name: 'Demo User',
        totpEnrolled: true,
      },
    });

    const authApi = createAuthApi({ client, csrfManager });

    await expect(
      authApi.confirmTotpEnrollment({
        loginToken: 'login-token',
        enrollmentToken: 'enrollment-token',
        otpCode: '123456',
      }),
    ).resolves.toEqual({
      memberUuid: '1',
      email: 'demo@fix.com',
      name: 'Demo User',
      role: 'ROLE_USER',
      totpEnrolled: true,
      accountId: undefined,
    });

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/members/me/totp/confirm',
      {
        loginToken: 'login-token',
        enrollmentToken: 'enrollment-token',
        otpCode: '123456',
      },
    );
    expect(csrfManager.onLoginSuccess).toHaveBeenCalledTimes(1);
  });

  it('submits the forgot-password payload as JSON', async () => {
    client.post.mockResolvedValue({
      statusCode: 202,
      body: {
        accepted: true,
        message: 'If the account is eligible, a reset email will be sent.',
        recovery: {
          challengeEndpoint: '/api/v1/auth/password/forgot/challenge',
          challengeMayBeRequired: true,
        },
      },
    });

    const authApi = createAuthApi({ client, csrfManager });

    await expect(
      authApi.requestPasswordResetEmail({
        email: 'demo@fix.com',
      }),
    ).resolves.toEqual({
      accepted: true,
      message: 'If the account is eligible, a reset email will be sent.',
      recovery: {
        challengeEndpoint: '/api/v1/auth/password/forgot/challenge',
        challengeMayBeRequired: true,
      },
    });

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/auth/password/forgot',
      {
        email: 'demo@fix.com',
      },
    );
  });

  it('bootstraps a password-recovery challenge as JSON', async () => {
    client.post.mockResolvedValue({
      statusCode: 200,
      body: {
        challengeToken: 'challenge-token',
        challengeType: 'captcha',
        challengeTtlSeconds: 300,
      },
    });

    const authApi = createAuthApi({ client, csrfManager });

    await expect(
      authApi.requestPasswordRecoveryChallenge({
        email: 'demo@fix.com',
      }),
    ).resolves.toEqual({
      challengeToken: 'challenge-token',
      challengeType: 'captcha',
      challengeTtlSeconds: 300,
    });

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/auth/password/forgot/challenge',
      {
        email: 'demo@fix.com',
      },
    );
  });

  it('submits the password-reset payload as JSON', async () => {
    client.post.mockResolvedValue({
      statusCode: 204,
      body: null,
    });

    const authApi = createAuthApi({ client, csrfManager });

    await expect(
      authApi.resetPassword({
        token: 'reset-token',
        newPassword: 'Test1234!',
      }),
    ).resolves.toBeUndefined();

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/auth/password/reset',
      {
        token: 'reset-token',
        newPassword: 'Test1234!',
      },
    );
  });
});
