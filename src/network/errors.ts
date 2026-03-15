import type { ApiResponseEnvelope, NormalizedHttpError } from './types';

export const DEFAULT_SERVER_ERROR_MESSAGE =
  'Unexpected server response. Please try again.';
export const NETWORK_ERROR_MESSAGE =
  'Unable to reach the server. Check your network and try again.';
export const TIMEOUT_ERROR_MESSAGE =
  'Request timed out. Please try again.';

interface NormalizeHttpErrorInput {
  headers?: Headers;
  status?: number;
  data?: unknown;
  timeout?: boolean;
  network?: boolean;
}

interface DirectApiErrorPayload {
  code?: string;
  message?: string;
  path?: string;
  correlationId?: string;
  operatorCode?: string;
  retryAfterSeconds?: unknown;
  remainingAttempts?: unknown;
  enrollUrl?: string;
  recoveryUrl?: string;
  userMessageKey?: string;
  timestamp?: string;
}

const parseRetryAfterSeconds = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.ceil(value);
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const asNumber = Number(trimmed);

  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.ceil(asNumber);
  }

  const asDate = Date.parse(trimmed);

  if (Number.isNaN(asDate)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
};

const getHeaderValue = (headers: Headers | undefined, key: string) =>
  headers?.get(key) ?? headers?.get(key.toLowerCase()) ?? undefined;

const resolveRetryAfterSeconds = (
  value: unknown,
  headers: Headers | undefined,
) =>
  parseRetryAfterSeconds(value)
  ?? parseRetryAfterSeconds(getHeaderValue(headers, 'Retry-After'));

const parseRemainingAttempts = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }

  return undefined;
};

export const createNormalizedHttpError = (
  message: string,
  options?: {
    code?: string;
    detail?: string;
    operatorCode?: string;
    retryAfterSeconds?: number;
    remainingAttempts?: number;
    status?: number;
    retriable?: boolean;
    traceId?: string;
    enrollUrl?: string;
    recoveryUrl?: string;
    userMessageKey?: string;
  },
): NormalizedHttpError => {
  const normalized = new Error(message) as NormalizedHttpError;
  normalized.name = 'MobHttpClientError';
  normalized.code = options?.code;
  normalized.detail = options?.detail;
  normalized.operatorCode = options?.operatorCode;
  normalized.retryAfterSeconds = options?.retryAfterSeconds;
  normalized.remainingAttempts = options?.remainingAttempts;
  normalized.status = options?.status;
  normalized.retriable = options?.retriable;
  normalized.traceId = options?.traceId;
  normalized.enrollUrl = options?.enrollUrl;
  normalized.recoveryUrl = options?.recoveryUrl;
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
    Object.hasOwn(candidate, 'data')
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
  const retryAfterSeconds = resolveRetryAfterSeconds(undefined, input.headers);

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
        retryAfterSeconds: resolveRetryAfterSeconds(
          input.data.error.retryAfterSeconds,
          input.headers,
        ),
        remainingAttempts: parseRemainingAttempts(input.data.error.remainingAttempts),
        status: input.status,
        traceId: input.data.traceId,
        enrollUrl: input.data.error.enrollUrl ?? undefined,
        recoveryUrl: input.data.error.recoveryUrl ?? undefined,
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
        retryAfterSeconds: resolveRetryAfterSeconds(
          input.data.retryAfterSeconds,
          input.headers,
        ),
        remainingAttempts: parseRemainingAttempts(input.data.remainingAttempts),
        status: input.status,
        traceId: input.data.correlationId,
        enrollUrl: input.data.enrollUrl,
        recoveryUrl: input.data.recoveryUrl,
        userMessageKey: input.data.userMessageKey,
      },
    );
  }

  return createNormalizedHttpError(DEFAULT_SERVER_ERROR_MESSAGE, {
    status: input.status,
    retryAfterSeconds,
  });
};
