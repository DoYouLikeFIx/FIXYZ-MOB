import {
  DEFAULT_HEALTH_TIMEOUT_MS,
  type SessionCookiePolicy,
} from '../config/environment';
import type { CsrfTokenManager } from './csrf';
import { normalizeHttpError } from './errors';
import type {
  HttpClientResponse,
  LenientApiResponseEnvelope,
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
): value is LenientApiResponseEnvelope<unknown> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.success === 'boolean' &&
    Object.hasOwn(candidate, 'data')
  );
};

const SAFE_METHODS = new Set<HttpMethod>(['GET', 'HEAD', 'OPTIONS']);

type CookieManagerBridge = {
  setFromResponse?: (url: string, cookie: string) => Promise<boolean>;
  flush?: () => Promise<void>;
};

let cookieManagerBridge: CookieManagerBridge | undefined;

const resolveCookieManagerBridge = (): CookieManagerBridge | undefined => {
  if (cookieManagerBridge !== undefined) {
    return cookieManagerBridge;
  }

  try {
    const cookieModule = require('@react-native-cookies/cookies');
    cookieManagerBridge = (cookieModule?.default ?? cookieModule) as CookieManagerBridge;
  } catch {
    cookieManagerBridge = undefined;
  }

  return cookieManagerBridge;
};

const persistResponseCookies = async (url: string, headers: Headers): Promise<void> => {
  const cookieManager = resolveCookieManagerBridge();
  const rawCookie = headers.get('set-cookie') ?? headers.get('Set-Cookie');

  if (!cookieManager?.setFromResponse || !rawCookie) {
    return;
  }

  try {
    await cookieManager.setFromResponse(url, rawCookie);
    await cookieManager.flush?.();
  } catch {
    // Ignore cookie bridge failures and fall back to the platform fetch behavior.
  }
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

    if (
      options.body !== undefined
      && typeof options.body !== 'string'
      && !Object.hasOwn(headers, 'Content-Type')
    ) {
      headers['Content-Type'] = 'application/json';
    }

    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;
    const requestBody: RequestInit['body'] =
      options.body === undefined
        ? undefined
        : typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body);
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;

    const sendRequest = async (
      csrfRetried: boolean,
    ): Promise<HttpClientResponse<T>> => {
      const requestHeaders = this.csrfManager
        ? await this.csrfManager.injectHeader(method, headers)
        : headers;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await this.fetchFn(url, {
          method,
          headers: requestHeaders,
          body: requestBody,
          credentials: 'include',
          signal: controller.signal,
        });
        await persistResponseCookies(url, response.headers);

        if (
          response.status === 403
          && !csrfRetried
          && this.csrfManager
          && !SAFE_METHODS.has(method)
        ) {
          await this.csrfManager.forceRefresh();

          return sendRequest(true);
        }

        const data = await parseBody(response);

        if (!response.ok) {
          throw normalizeHttpError({
            data,
            headers: response.headers,
            status: response.status,
          });
        }

        if (isApiResponseEnvelope(data)) {
          if (!data.success) {
            throw normalizeHttpError({
              data,
              headers: response.headers,
              status: response.status,
            });
          }

          return {
            statusCode: response.status,
            body: data.data as T,
            headers: response.headers,
          };
        }

        return {
          statusCode: response.status,
          body: data as T,
          headers: response.headers,
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
    };

    return sendRequest(false);
  }
}

const isNormalizedHttpError = (value: unknown): value is NormalizedHttpError => {
  if (!(value instanceof Error)) {
    return false;
  }

  const candidate = value as Partial<NormalizedHttpError>;
  return candidate.name === 'MobHttpClientError';
};
