import type { ApiResponseEnvelope, NormalizedHttpError } from './types';

export const DEFAULT_SERVER_ERROR_MESSAGE =
  'Unexpected server response. Please try again.';
export const NETWORK_ERROR_MESSAGE =
  'Unable to reach the server. Check your network and try again.';
export const TIMEOUT_ERROR_MESSAGE =
  'Request timed out. Please try again.';

interface NormalizeHttpErrorInput {
  status?: number;
  data?: unknown;
  headers?: Headers;
  timeout?: boolean;
  network?: boolean;
}

interface DirectApiErrorPayload {
  code?: string;
  message?: string;
  path?: string;
  correlationId?: string;
  operatorCode?: string;
  retryAfterSeconds?: number;
  userMessageKey?: string;
  timestamp?: string;
}

const parseRetryAfterSeconds = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  return undefined;
};

const getHeaderValue = (headers: Headers | undefined, key: string) =>
  headers?.get(key) ?? headers?.get(key.toLowerCase()) ?? undefined;

export const createNormalizedHttpError = (
  message: string,
  options?: {
    code?: string;
    detail?: string;
    operatorCode?: string;
    retryAfterSeconds?: number;
    status?: number;
    retriable?: boolean;
    traceId?: string;
    userMessageKey?: string;
  },
): NormalizedHttpError => {
  const normalized = new Error(message) as NormalizedHttpError;
  normalized.name = 'MobHttpClientError';
  normalized.code = options?.code;
  normalized.detail = options?.detail;
  normalized.operatorCode = options?.operatorCode;
  normalized.retryAfterSeconds = options?.retryAfterSeconds;
  normalized.status = options?.status;
  normalized.retriable = options?.retriable;
  normalized.traceId = options?.traceId;
  normalized.userMessageKey = options?.userMessageKey;

  return normalized;
};

const isApiResponseEnvelope = (
  value: unknown,
): value is ApiResponseEnvelope<unknown> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.success === 'boolean' &&
    Object.hasOwn(candidate, 'data') &&
    Object.hasOwn(candidate, 'error')
  );
};

const isDirectApiErrorPayload = (
  value: unknown,
): value is DirectApiErrorPayload => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string'
  );
};

export const normalizeHttpError = (
  input: NormalizeHttpErrorInput,
): NormalizedHttpError => {
  if (input.timeout) {
    return createNormalizedHttpError(TIMEOUT_ERROR_MESSAGE, {
      status: input.status,
      retriable: true,
    });
  }

  if (input.network) {
    return createNormalizedHttpError(NETWORK_ERROR_MESSAGE, {
      status: input.status,
      retriable: true,
    });
  }

  if (isApiResponseEnvelope(input.data) && input.data.error) {
    return createNormalizedHttpError(
      input.data.error.message || DEFAULT_SERVER_ERROR_MESSAGE,
      {
        code: input.data.error.code,
        detail: input.data.error.detail,
        operatorCode: input.data.error.operatorCode ?? undefined,
        retryAfterSeconds:
          parseRetryAfterSeconds(input.data.error.retryAfterSeconds)
          ?? parseRetryAfterSeconds(getHeaderValue(input.headers, 'Retry-After')),
        status: input.status,
        traceId: input.data.traceId,
        userMessageKey: input.data.error.userMessageKey ?? undefined,
      },
    );
  }

  if (isDirectApiErrorPayload(input.data)) {
    return createNormalizedHttpError(
      input.data.message || DEFAULT_SERVER_ERROR_MESSAGE,
      {
        code: input.data.code,
        detail: input.data.path,
        operatorCode: input.data.operatorCode,
        retryAfterSeconds:
          parseRetryAfterSeconds(input.data.retryAfterSeconds)
          ?? parseRetryAfterSeconds(getHeaderValue(input.headers, 'Retry-After')),
        status: input.status,
        traceId: input.data.correlationId,
        userMessageKey: input.data.userMessageKey,
      },
    );
  }

  return createNormalizedHttpError(DEFAULT_SERVER_ERROR_MESSAGE, {
    status: input.status,
    retryAfterSeconds: parseRetryAfterSeconds(getHeaderValue(input.headers, 'Retry-After')),
  });
};
