import {
  DEFAULT_HEALTH_TIMEOUT_MS,
  type SessionCookiePolicy,
} from '../config/environment';
import { normalizeHttpError } from './errors';
import type { CsrfTokenManager } from './csrf';
import type {
  ApiResponseEnvelope,
  HttpClientResponse,
  NormalizedHttpError,
} from './types';

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

interface RequestOptions {
  method?: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

interface HttpClientInput {
  baseUrl: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  csrfManager?: CsrfTokenManager;
  cookiePolicy?: SessionCookiePolicy;
}

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

const parseBody = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export class HttpClient {
  private readonly baseUrl: string;

  private readonly fetchFn: typeof fetch;

  private readonly defaultTimeoutMs: number;

  private readonly csrfManager?: CsrfTokenManager;

  readonly cookiePolicy?: SessionCookiePolicy;

  constructor(input: HttpClientInput) {
    this.baseUrl = input.baseUrl.replace(/\/+$/, '');
    this.fetchFn = input.fetchFn ?? fetch;
    this.defaultTimeoutMs = input.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
    this.csrfManager = input.csrfManager;
    this.cookiePolicy = input.cookiePolicy;
  }

  getDefaultTimeoutMs(): number {
    return this.defaultTimeoutMs;
  }

  async get<T>(
    path: string,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T>(
    path: string,
    body: unknown,
    options: Omit<RequestOptions, 'method' | 'body'> = {},
  ): Promise<HttpClientResponse<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }

  async request<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<HttpClientResponse<T>> {
    const method = (options.method ?? 'GET').toUpperCase() as HttpMethod;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.headers ?? {}),
    };

    if (options.body !== undefined && !Object.hasOwn(headers, 'Content-Type')) {
      headers['Content-Type'] = 'application/json';
    }

    const finalHeaders = this.csrfManager
      ? await this.csrfManager.injectHeader(method, headers)
      : headers;

    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
      const response = await this.fetchFn(url, {
        method,
        headers: finalHeaders,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        credentials: 'include',
        signal: controller.signal,
      });

      const data = await parseBody(response);

      if (!response.ok) {
        throw normalizeHttpError({ status: response.status, data });
      }

      if (isApiResponseEnvelope(data)) {
        if (!data.success) {
          throw normalizeHttpError({ status: response.status, data });
        }

        return {
          statusCode: response.status,
          body: data.data as T,
        };
      }

      return {
        statusCode: response.status,
        body: data as T,
      };
    } catch (error: unknown) {
      if (isNormalizedHttpError(error)) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw normalizeHttpError({ timeout: true });
      }

      throw normalizeHttpError({ network: true });
    } finally {
      clearTimeout(timer);
    }
  }
}

const isNormalizedHttpError = (value: unknown): value is NormalizedHttpError => {
  if (!(value instanceof Error)) {
    return false;
  }

  const candidate = value as Partial<NormalizedHttpError>;
  return candidate.name === 'MobHttpClientError';
};
