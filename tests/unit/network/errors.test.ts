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
          code: 'FEP-001',
          message: '주문 서비스를 잠시 사용할 수 없습니다',
          detail: '거래소 연결이 일시적으로 불안정합니다. 주문이 접수되지 않았을 수 있습니다.',
          operatorCode: 'CIRCUIT_OPEN',
          retryAfterSeconds: 10,
          timestamp: '2026-03-02T00:00:00Z',
        },
      },
      headers: new Headers({
        'Retry-After': '10',
      }),
    });

    expect(normalized.code).toBe('FEP-001');
    expect(normalized.message).toBe('주문 서비스를 잠시 사용할 수 없습니다');
    expect(normalized.status).toBe(422);
    expect(normalized.operatorCode).toBe('CIRCUIT_OPEN');
    expect(normalized.retryAfterSeconds).toBe(10);
  });

  it('preserves backend details needed for stale-quote UX', () => {
    const normalized = normalizeHttpError({
      status: 400,
      data: {
        success: false,
        data: null,
        error: {
          code: 'VALIDATION-003',
          message: 'stale quote',
          detail: 'market quote snapshot is stale',
          details: {
            symbol: '005930',
            quoteSnapshotId: 'qsnap-replay-001',
            snapshotAgeMs: 65000,
            quoteSourceMode: 'REPLAY',
          },
          operatorCode: 'STALE_QUOTE',
          userMessageKey: 'error.quote.stale',
          timestamp: '2026-03-23T00:00:00Z',
        },
      },
    });

    expect(normalized.details).toEqual({
      symbol: '005930',
      quoteSnapshotId: 'qsnap-replay-001',
      snapshotAgeMs: 65000,
      quoteSourceMode: 'REPLAY',
    });
  });

  it('parses direct spring security and exception-handler error payloads', () => {
    const normalized = normalizeHttpError({
      status: 401,
      data: {
        code: 'AUTH-003',
        message: 'authentication required',
        path: '/api/v1/auth/session',
        correlationId: 'corr-123',
        timestamp: '2026-03-09T00:00:00Z',
      },
    });

    expect(normalized.code).toBe('AUTH-003');
    expect(normalized.message).toBe('authentication required');
    expect(normalized.status).toBe(401);
    expect(normalized.traceId).toBe('corr-123');
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

  it('preserves envelope trace ids for downstream support diagnostics', () => {
    const normalized = normalizeHttpError({
      status: 500,
      data: {
        success: false,
        data: null,
        traceId: 'trace-auth-001',
        error: {
          code: 'SYS-500',
          message: 'Internal server failure',
          detail: 'Unexpected exception',
          timestamp: '2026-03-09T00:00:00Z',
        },
      },
    });

    expect(normalized.traceId).toBe('trace-auth-001');
  });

  it('falls back to the response header correlation id when an envelope omits traceId', () => {
    const normalized = normalizeHttpError({
      status: 422,
      data: {
        success: false,
        data: null,
        error: {
          code: 'FEP-001',
          message: '주문 서비스를 잠시 사용할 수 없습니다',
          detail: '거래소 연결이 일시적으로 불안정합니다. 주문이 접수되지 않았을 수 있습니다.',
          operatorCode: 'CIRCUIT_OPEN',
          timestamp: '2026-03-09T00:00:00Z',
        },
      },
      headers: new Headers({
        'Retry-After': '10',
        'X-Correlation-Id': 'trace-envelope-header-001',
      }),
    });

    expect(normalized.code).toBe('FEP-001');
    expect(normalized.message).toBe('주문 서비스를 잠시 사용할 수 없습니다');
    expect(normalized.detail).toBe('거래소 연결이 일시적으로 불안정합니다. 주문이 접수되지 않았을 수 있습니다.');
    expect(normalized.operatorCode).toBe('CIRCUIT_OPEN');
    expect(normalized.retryAfterSeconds).toBe(10);
    expect(normalized.traceId).toBe('trace-envelope-header-001');
  });

  it('falls back to the response header correlation id when the body does not provide one', () => {
    const normalized = normalizeHttpError({
      status: 502,
      data: {
        message: 'Bad gateway',
      },
      headers: new Headers({
        'X-Correlation-Id': 'trace-header-001',
      }),
    });

    expect(normalized.traceId).toBe('trace-header-001');
  });

  it('ignores unsupported direct-payload fields while preserving supported error metadata', () => {
    const normalized = normalizeHttpError({
      status: 429,
      data: {
        code: 'RATE-001',
        message: 'Too many attempts',
        correlationId: 'corr-789',
        operatorCode: 'ABUSE_LIMIT',
        retryAfterSeconds: 30,
        remainingAttempts: 0,
        email: 'secret@example.com',
        accountNumber: '123-45-6789',
      },
      headers: new Headers({
        'X-Correlation-Id': 'trace-header-should-not-win',
      }),
    });

    expect(normalized.traceId).toBe('corr-789');
    expect(normalized.operatorCode).toBe('ABUSE_LIMIT');
    expect(normalized.retryAfterSeconds).toBe(30);
    expect(normalized.remainingAttempts).toBe(0);
    expect(normalized).not.toHaveProperty('email');
    expect(normalized).not.toHaveProperty('accountNumber');
  });

  it('normalizes timeout and network failures', () => {
    expect(normalizeHttpError({ timeout: true }).message).toBe(TIMEOUT_ERROR_MESSAGE);
    expect(normalizeHttpError({ network: true }).message).toBe(NETWORK_ERROR_MESSAGE);
    expect(normalizeHttpError({}).message).toBe(DEFAULT_SERVER_ERROR_MESSAGE);
  });
});
