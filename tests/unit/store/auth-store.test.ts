import { authStore, resetAuthStore } from '@/store/auth-store';

describe('mobile auth store', () => {
  afterEach(() => {
    resetAuthStore();
  });

  it('initializes the authenticated member and clears transient guidance', () => {
    authStore.requireReauth('세션이 만료되었습니다. 다시 로그인해 주세요.');

    authStore.initialize({
      memberUuid: 'member-001',
      username: 'demo',
      email: 'demo@fix.com',
      name: 'Demo User',
      role: 'ROLE_USER',
      totpEnrolled: false,
    });

    expect(authStore.getState()).toMatchObject({
      status: 'authenticated',
      member: {
        username: 'demo',
      },
      reauthMessage: null,
    });
  });

  it('moves back to anonymous state when re-authentication is required', () => {
    authStore.login({
      memberUuid: 'member-001',
      username: 'demo',
      email: 'demo@fix.com',
      name: 'Demo User',
      role: 'ROLE_USER',
      totpEnrolled: false,
    });

    authStore.requireReauth('세션이 만료되었습니다. 다시 로그인해 주세요.');

    expect(authStore.getState()).toMatchObject({
      status: 'anonymous',
      member: null,
      reauthMessage: '세션이 만료되었습니다. 다시 로그인해 주세요.',
    });
  });
});
