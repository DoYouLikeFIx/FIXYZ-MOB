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
    traceId?: string;
  },
): NormalizedHttpError => {
  const normalized = new Error(message) as NormalizedHttpError;
  normalized.name = 'MobHttpClientError';
  normalized.code = options?.code;
  normalized.detail = options?.detail;
  normalized.status = options?.status;
  normalized.retriable = options?.retriable;
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

export const normalizeHttpError = (
  input: NormalizeHttpErrorInput,
): NormalizedHttpError => {
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
        status: input.status,
        traceId: input.data.correlationId,
      },
    );
  }

  return buildNormalizedError(DEFAULT_SERVER_ERROR_MESSAGE, {
    status: input.status,
  });
};
