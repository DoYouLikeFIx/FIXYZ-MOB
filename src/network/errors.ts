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
  timestamp?: string;
}

const buildNormalizedError = (
  message: string,
  options?: {
    code?: string;
    detail?: string;
    status?: number;
    retriable?: boolean;
    retryAfterSeconds?: number;
    traceId?: string;
  },
): NormalizedHttpError => {
  const normalized = new Error(message) as NormalizedHttpError;
  normalized.name = 'MobHttpClientError';
  normalized.code = options?.code;
  normalized.detail = options?.detail;
  normalized.status = options?.status;
  normalized.retriable = options?.retriable;
  normalized.retryAfterSeconds = options?.retryAfterSeconds;
  normalized.traceId = options?.traceId;

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

const parseRetryAfterSeconds = (value: string | null) => {
  if (!value) {
    return undefined;
  }

  const asNumber = Number(value);

  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.ceil(asNumber);
  }

  const asDate = Date.parse(value);

  if (Number.isNaN(asDate)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
};

export const normalizeHttpError = (
  input: NormalizeHttpErrorInput,
): NormalizedHttpError => {
  const retryAfterSeconds = parseRetryAfterSeconds(
    input.headers?.get('Retry-After') ?? null,
  );

  if (input.timeout) {
    return buildNormalizedError(TIMEOUT_ERROR_MESSAGE, {
      status: input.status,
      retriable: true,
    });
  }

  if (input.network) {
    return buildNormalizedError(NETWORK_ERROR_MESSAGE, {
      status: input.status,
      retriable: true,
    });
  }

  if (isApiResponseEnvelope(input.data) && input.data.error) {
    return buildNormalizedError(
      input.data.error.message || DEFAULT_SERVER_ERROR_MESSAGE,
      {
        code: input.data.error.code,
        detail: input.data.error.detail,
        retryAfterSeconds,
        status: input.status,
        traceId: input.data.traceId,
      },
    );
  }

  if (isDirectApiErrorPayload(input.data)) {
    return buildNormalizedError(
      input.data.message || DEFAULT_SERVER_ERROR_MESSAGE,
      {
        code: input.data.code,
        detail: input.data.path,
        retryAfterSeconds,
        status: input.status,
        traceId: input.data.correlationId,
      },
    );
  }

  return buildNormalizedError(DEFAULT_SERVER_ERROR_MESSAGE, {
    retryAfterSeconds,
    status: input.status,
  });
};
