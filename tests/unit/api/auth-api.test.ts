import { createAuthApi } from '@/api/auth-api';
import type { Member } from '@/types/auth';

const memberFixture: Member = {
  memberUuid: 'member-001',
  username: 'demo',
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
        username: 'demo',
        password: 'Test1234!',
      }),
    ).resolves.toEqual(memberFixture);

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/auth/login',
      'email=demo&password=Test1234%21',
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
        username: 'new_user',
        email: 'new@fix.com',
        name: 'New User',
        password: 'Test1234!',
      }),
    ).resolves.toEqual({
      memberUuid: '1',
      username: 'new',
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
});
