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

  it('logs in a member and refreshes csrf bootstrap state for subsequent protected calls', async () => {
    client.post.mockResolvedValue({
      statusCode: 200,
      body: {
        memberId: 1,
        email: 'demo@fix.com',
        name: 'Demo User',
      },
    });
    client.get.mockResolvedValue({
      statusCode: 200,
      body: memberFixture,
    });

    const authApi = createAuthApi({ client, csrfManager });

    await expect(
      authApi.loginMember({
        email: 'demo@fix.com',
        password: 'Test1234!',
      }),
    ).resolves.toEqual(memberFixture);

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      'email=demo%40fix.com&password=Test1234%21',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );
    expect(client.get).toHaveBeenCalledWith('/api/v1/auth/session');
    expect(csrfManager.onLoginSuccess).toHaveBeenCalledTimes(1);
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
