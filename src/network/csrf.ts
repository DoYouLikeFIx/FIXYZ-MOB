import type { CookieReader } from './cookie-manager';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
  bootstrapCsrf: () => Promise<void>;
}

export class CsrfTokenManager {
  private readonly baseUrl: string;

  private readonly cookieManager: CookieReader;

  private readonly bootstrapCsrfFn: () => Promise<void>;

  constructor(input: CsrfTokenManagerInput) {
    this.baseUrl = input.baseUrl;
    this.cookieManager = input.cookieManager;
    this.bootstrapCsrfFn = input.bootstrapCsrf;
  }

  async onAppColdStart(): Promise<void> {
    await this.bootstrapCsrfFn();
  }

  async onLoginSuccess(): Promise<void> {
    await this.bootstrapCsrfFn();
  }

  async onForegroundResume(): Promise<void> {
    await this.bootstrapCsrfFn();
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
      await this.bootstrapCsrfFn();
      token = await this.readXsrfCookie();
    }

    if (!token) {
      throw new MissingCsrfTokenError();
    }

    return {
      ...headers,
      'X-XSRF-TOKEN': token,
    };
  }

  private async readXsrfCookie(): Promise<string | undefined> {
    const cookies = await this.cookieManager.get(this.baseUrl);
    return cookies['XSRF-TOKEN']?.value;
  }
}
