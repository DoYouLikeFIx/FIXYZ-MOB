import {
  DEFAULT_SERVER_ERROR_MESSAGE,
} from '@/network/errors';
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
});
