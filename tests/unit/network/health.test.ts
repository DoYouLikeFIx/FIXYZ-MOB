import { checkHealth, DEFAULT_HEALTH_TIMEOUT_MS } from '@/network/health';

describe('health smoke check', () => {
  it('uses GET /actuator/health with 5s timeout and expects HTTP 200', async () => {
    const calls: Array<{ path: string; timeoutMs: number }> = [];

    const response = await checkHealth({
      get: async (path, options) => {
        calls.push({ path, timeoutMs: options.timeoutMs });
        return {
          statusCode: 200,
          body: { status: 'UP' },
        };
      },
    });

    expect(calls).toEqual([
      {
        path: '/actuator/health',
        timeoutMs: DEFAULT_HEALTH_TIMEOUT_MS,
      },
    ]);
    expect(response.statusCode).toBe(200);
  });
});
