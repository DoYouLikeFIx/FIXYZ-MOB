import type { CsrfTokenManager } from '../network/csrf';
import type { HttpClient } from '../network/http-client';
import type { LoginRequest, Member, RegisterRequest } from '../types/auth';

export interface AuthApi {
  fetchSession: () => Promise<Member>;
  loginMember: (payload: LoginRequest) => Promise<Member>;
  registerMember: (payload: RegisterRequest) => Promise<Member>;
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
    const response = await client.post<Member>('/api/v1/auth/login', payload);

    if (csrfManager) {
      await csrfManager.onLoginSuccess();
    }

    return response.body;
  },
  registerMember: async (payload) => {
    const response = await client.post<Member>('/api/v1/auth/register', payload);
    return response.body;
  },
});
