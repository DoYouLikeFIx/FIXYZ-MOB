import {
  DEFAULT_SERVER_ERROR_MESSAGE,
} from '@/network/errors';
import { InMemoryCookieManager } from '@/network/cookie-manager';
import { CsrfTokenManager } from '@/network/csrf';
import { HttpClient } from '@/network/http-client';
import type { NormalizedHttpError } from '@/network/types';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

describe('API tests: HttpClient contract', () => {
  it('returns parsed payload for HTTP 200 success envelope', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        data: {
          status: 'UP',
        },
        error: null,
      }),
    );

    const client = new HttpClient({
      baseUrl: 'http://localhost:8080',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const response = await client.get<{ status: string }>('/actuator/health');

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: 'UP' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/actuator/health',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      }),
    );
  });

  it('unwraps success envelopes even when the backend omits the error field', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        data: {
          token: 'csrf-token',
          headerName: 'X-CSRF-TOKEN',
        },
        timestamp: '2026-03-16T00:00:00Z',
      }),
    );

    const client = new HttpClient({
      baseUrl: 'http://localhost:8080',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const response = await client.get<{ token: string; headerName: string }>('/api/v1/auth/csrf');

    expect(response.body).toEqual({
      token: 'csrf-token',
      headerName: 'X-CSRF-TOKEN',
    });
  });

  it('normalizes HTTP 400 API envelope errors', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(400, {
        success: false,
        data: null,
        error: {
          code: 'CORE-002',
          message: 'Invalid request',
          detail: 'Body format mismatch',
          timestamp: '2026-03-02T00:00:00Z',
        },
      }),
    );

    const client = new HttpClient({
      baseUrl: 'http://localhost:8080',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await expect(client.get('/api/v1/sample')).rejects.toMatchObject({
      code: 'CORE-002',
      status: 400,
      message: 'Invalid request',
    });
  });

  it('normalizes HTTP 404 into deterministic app error', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(404, {
        message: 'Not Found',
      }),
    );

    const client = new HttpClient({
      baseUrl: 'http://localhost:8080',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await expect(client.get('/api/v1/missing')).rejects.toMatchObject({
      status: 404,
      message: DEFAULT_SERVER_ERROR_MESSAGE,
    });
  });

  it('normalizes HTTP 500 API envelope errors with server code', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(500, {
        success: false,
        data: null,
        error: {
          code: 'SYS-500',
          message: 'Internal server failure',
          detail: 'Unexpected exception',
          timestamp: '2026-03-02T00:00:00Z',
        },
      }),
    );

    const client = new HttpClient({
      baseUrl: 'http://localhost:8080',
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    await expect(client.get('/api/v1/failure')).rejects.toMatchObject({
      code: 'SYS-500',
      status: 500,
      message: 'Internal server failure',
    } satisfies Partial<NormalizedHttpError>);
  });

  it('refreshes csrf and retries an unsafe request once after a 403 response', async () => {
    let postAttempts = 0;
    const cookieManager = new InMemoryCookieManager();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.endsWith('/api/v1/auth/csrf')) {
        const nextToken = postAttempts === 0 ? 'csrf-1' : 'csrf-2';
        cookieManager.setCookie('http://localhost:8080', 'XSRF-TOKEN', nextToken);

        return jsonResponse(200, {
          success: true,
          data: {
            token: nextToken,
          },
          error: null,
        });
      }

      if (url.endsWith('/api/v1/auth/password/reset')) {
        postAttempts += 1;

        if (postAttempts === 1) {
          return jsonResponse(403, {
            status: 403,
            error: 'Forbidden',
            message: 'Forbidden',
          });
        }

        return new Response(null, {
          status: 204,
        });
      }

      return jsonResponse(404, { message: 'Not Found' });
    });

    const csrfManager = new CsrfTokenManager({
      baseUrl: 'http://localhost:8080',
      cookieManager,
      bootstrapCsrf: async () => {
        const response = await fetchMock('http://localhost:8080/api/v1/auth/csrf');
        const payload = await response.json() as {
          data: { token: string };
        };

        return payload.data;
      },
    });

    const client = new HttpClient({
      baseUrl: 'http://localhost:8080',
      fetchFn: fetchMock as unknown as typeof fetch,
      csrfManager,
    });

    await expect(
      client.post('/api/v1/auth/password/reset', {
        token: 'reset-token',
        newPassword: 'Test1234!',
      }),
    ).resolves.toMatchObject({
      statusCode: 204,
      body: null,
    });

    expect(postAttempts).toBe(2);
  });
});
