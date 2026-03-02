export interface ApiErrorPayload {
  code: string;
  message: string;
  detail: string;
  timestamp: string;
}

export interface ApiResponseEnvelope<T> {
  success: boolean;
  data: T | null;
  error: ApiErrorPayload | null;
}

export interface NormalizedHttpError extends Error {
  code?: string;
  status?: number;
  detail?: string;
  retriable?: boolean;
}

export interface HttpClientResponse<T> {
  statusCode: number;
  body: T;
}
