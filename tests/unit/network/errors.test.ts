import {
  DEFAULT_SERVER_ERROR_MESSAGE,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
  normalizeHttpError,
} from '@/network/errors';

describe('network error normalization', () => {
  it('parses standardized backend envelope errors', () => {
    const normalized = normalizeHttpError({
      status: 422,
      data: {
        success: false,
        data: null,
        error: {
          code: 'CORE-002',
          message: 'Insufficient position',
          detail: 'Insufficient quantity for requested order',
          timestamp: '2026-03-02T00:00:00Z',
        },
      },
    });

    expect(normalized.code).toBe('CORE-002');
    expect(normalized.message).toBe('Insufficient position');
    expect(normalized.status).toBe(422);
  });

  it('preserves auth/session guardrail codes for downstream re-auth and abuse handling', () => {
    const invalidatedByNewLogin = normalizeHttpError({
      status: 401,
      data: {
        success: false,
        data: null,
        error: {
          code: 'AUTH-016',
          message: 'Session expired by new login',
          detail: 'Existing session was invalidated by another device login',
          timestamp: '2026-03-07T00:00:00Z',
        },
      },
    });

    const rateLimited = normalizeHttpError({
      status: 429,
      data: {
        success: false,
        data: null,
        error: {
          code: 'RATE-001',
          message: 'Too many attempts',
          detail: 'IP rate limit exceeded',
          timestamp: '2026-03-07T00:00:00Z',
        },
      },
    });

    expect(invalidatedByNewLogin.code).toBe('AUTH-016');
    expect(invalidatedByNewLogin.status).toBe(401);
    expect(rateLimited.code).toBe('RATE-001');
    expect(rateLimited.status).toBe(429);
  });

  it('normalizes timeout and network failures', () => {
    expect(normalizeHttpError({ timeout: true }).message).toBe(TIMEOUT_ERROR_MESSAGE);
    expect(normalizeHttpError({ network: true }).message).toBe(NETWORK_ERROR_MESSAGE);
    expect(normalizeHttpError({}).message).toBe(DEFAULT_SERVER_ERROR_MESSAGE);
  });
});
