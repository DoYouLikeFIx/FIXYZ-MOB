import type { CookieReader } from './cookie-manager';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DEFAULT_CSRF_HEADER = 'X-XSRF-TOKEN';

export interface CsrfBootstrapPayload {
  csrfToken?: string;
  token?: string;
  headerName?: string;
}

export class MissingCsrfTokenError extends Error {
  readonly code = 'MOB-CSRF-001';

  constructor() {
    super('MOB-CSRF-001: Missing XSRF-TOKEN after bootstrap retry');
    this.name = 'MissingCsrfTokenError';
  }
}

interface CsrfTokenManagerInput {
  baseUrl: string;
  cookieManager: CookieReader;
  bootstrapCsrf: () => Promise<CsrfBootstrapPayload | void>;
}

export class CsrfTokenManager {
  private readonly baseUrl: string;

  private readonly cookieManager: CookieReader;

  private readonly bootstrapCsrfFn: () => Promise<CsrfBootstrapPayload | void>;

  private cachedToken?: string;

  private csrfHeaderName = DEFAULT_CSRF_HEADER;

  constructor(input: CsrfTokenManagerInput) {
    this.baseUrl = input.baseUrl;
    this.cookieManager = input.cookieManager;
    this.bootstrapCsrfFn = input.bootstrapCsrf;
  }

  async onAppColdStart(): Promise<void> {
    await this.refreshToken();
  }

  async onLoginSuccess(): Promise<void> {
    await this.refreshToken();
  }

  async onForegroundResume(): Promise<void> {
    await this.refreshToken();
  }

  async forceRefresh(): Promise<{ headerName: string; token: string }> {
    const token = await this.refreshToken();

    if (!token) {
      throw new MissingCsrfTokenError();
    }

    return {
      headerName: this.csrfHeaderName,
      token,
    };
  }

  async injectHeader(
    method: string,
    headers: Record<string, string>,
  ): Promise<Record<string, string>> {
    const normalizedMethod = method.toUpperCase();

    if (SAFE_METHODS.has(normalizedMethod)) {
      return headers;
    }

    let token = await this.readXsrfCookie();

    if (!token) {
      token = this.cachedToken;
    }

    if (!token) {
      token = await this.refreshToken();
    }

    if (!token) {
      throw new MissingCsrfTokenError();
    }

    return {
      ...headers,
      [this.csrfHeaderName]: token,
    };
  }

  private async readXsrfCookie(): Promise<string | undefined> {
    const cookies = await this.cookieManager.get(this.baseUrl);
    return cookies['XSRF-TOKEN']?.value;
  }

  private async refreshToken(): Promise<string | undefined> {
    const payload = await this.bootstrapCsrfFn();
    const cookieToken = await this.readXsrfCookie();
    const bodyToken = payload?.csrfToken ?? payload?.token;

    if (typeof payload?.headerName === 'string' && payload.headerName.trim().length > 0) {
      this.csrfHeaderName = payload.headerName;
    }

    const resolvedToken = cookieToken ?? bodyToken;

    if (resolvedToken) {
      this.cachedToken = resolvedToken;
    }

    return resolvedToken;
  }
}
