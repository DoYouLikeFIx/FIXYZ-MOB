import { InMemoryCookieManager } from '@/network/cookie-manager';
import { CsrfTokenManager } from '@/network/csrf';
import { checkHealth } from '@/network/health';
import { HttpClient } from '@/network/http-client';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

describe('E2E tests: mobile foundation workflow', () => {
  it('executes cold-start CSRF bootstrap, health check, and state-changing call with CSRF header', async () => {
    const baseUrl = 'http://localhost:8080';
    const cookieManager = new InMemoryCookieManager();

    const calls: Array<{ url: string; method: string; headers: Record<string, string> }> = [];

    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const url = String(input);
        const method = (init?.method ?? 'GET').toUpperCase();
        const headers = (init?.headers ?? {}) as Record<string, string>;

        calls.push({
          url,
          method,
          headers,
        });

        if (url.endsWith('/api/v1/auth/csrf')) {
          return jsonResponse(200, {
            success: true,
            data: {
              csrfToken: 'csrf-boot-token',
            },
            error: null,
          });
        }

        if (url.endsWith('/actuator/health')) {
          return jsonResponse(200, {
            status: 'UP',
          });
        }

        if (url.endsWith('/api/v1/orders') && method === 'POST') {
          return jsonResponse(200, {
            success: true,
            data: {
              orderId: 'ord-1',
              result: 'CREATED',
            },
            error: null,
          });
        }

        return jsonResponse(404, {
          message: 'Not Found',
        });
      },
    );

    const bootstrapClient = new HttpClient({
      baseUrl,
      fetchFn: fetchMock as unknown as typeof fetch,
    });

    const csrfManager = new CsrfTokenManager({
      baseUrl,
      cookieManager,
      bootstrapCsrf: async () => {
        await bootstrapClient.get('/api/v1/auth/csrf');
        cookieManager.setCookie(baseUrl, 'XSRF-TOKEN', 'csrf-boot-token');
      },
    });

    const client = new HttpClient({
      baseUrl,
      fetchFn: fetchMock as unknown as typeof fetch,
      csrfManager,
    });

    await csrfManager.onAppColdStart();
    await checkHealth(client);
    const orderResponse = await client.post<{ orderId: string; result: string }>(
      '/api/v1/orders',
      {
        symbol: '005930',
        qty: 1,
      },
    );

    expect(orderResponse.statusCode).toBe(200);
    expect(orderResponse.body.orderId).toBe('ord-1');

    const csrfCall = calls.find(
      (call) => call.method === 'GET' && call.url.endsWith('/api/v1/auth/csrf'),
    );
    expect(csrfCall).toBeDefined();

    const healthCall = calls.find(
      (call) => call.method === 'GET' && call.url.endsWith('/actuator/health'),
    );
    expect(healthCall).toBeDefined();

    const orderCall = calls.find(
      (call) => call.method === 'POST' && call.url.endsWith('/api/v1/orders'),
    );
    expect(orderCall).toBeDefined();
    expect(orderCall?.headers['X-XSRF-TOKEN']).toBe('csrf-boot-token');
  });
});
