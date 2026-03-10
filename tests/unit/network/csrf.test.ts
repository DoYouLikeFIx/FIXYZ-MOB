import { InMemoryCookieManager } from '@/network/cookie-manager';
import { CsrfTokenManager } from '@/network/csrf';

describe('csrf token manager', () => {
  it('injects csrf header for unsafe methods', async () => {
    const cookies = new InMemoryCookieManager();
    cookies.setCookie('http://localhost:8080', 'XSRF-TOKEN', 'csrf-123');
    const csrf = new CsrfTokenManager({
      baseUrl: 'http://localhost:8080',
      cookieManager: cookies,
      bootstrapCsrf: async () => {},
    });

    const headers = await csrf.injectHeader('POST', {});

    expect(headers['X-XSRF-TOKEN']).toBe('csrf-123');
  });

  it('skips csrf header for safe methods', async () => {
    const cookies = new InMemoryCookieManager();
    cookies.setCookie('http://localhost:8080', 'XSRF-TOKEN', 'csrf-123');
    const csrf = new CsrfTokenManager({
      baseUrl: 'http://localhost:8080',
      cookieManager: cookies,
      bootstrapCsrf: async () => {},
    });

    const headers = await csrf.injectHeader('GET', { Existing: 'ok' });

    expect(headers).toEqual({ Existing: 'ok' });
  });

  it('re-bootstraps once when token is missing and then injects', async () => {
    const cookies = new InMemoryCookieManager();
    let bootstraps = 0;
    const csrf = new CsrfTokenManager({
      baseUrl: 'http://localhost:8080',
      cookieManager: cookies,
      bootstrapCsrf: async () => {
        bootstraps += 1;
        cookies.setCookie('http://localhost:8080', 'XSRF-TOKEN', 'new-csrf');
      },
    });

    const headers = await csrf.injectHeader('PATCH', {});

    expect(bootstraps).toBe(1);
    expect(headers['X-XSRF-TOKEN']).toBe('new-csrf');
  });

  it('falls back to bootstrap response token and header when cookie storage is unavailable', async () => {
    const cookies = new InMemoryCookieManager();
    let bootstraps = 0;
    const csrf = new CsrfTokenManager({
      baseUrl: 'http://localhost:18080',
      cookieManager: cookies,
      bootstrapCsrf: async () => {
        bootstraps += 1;
        return {
          token: 'body-csrf',
          headerName: 'X-CSRF-TOKEN',
        };
      },
    });

    const headers = await csrf.injectHeader('POST', {});

    expect(bootstraps).toBe(1);
    expect(headers['X-CSRF-TOKEN']).toBe('body-csrf');
  });

  it('fails deterministically after single bootstrap retry when token is still missing', async () => {
    const cookies = new InMemoryCookieManager();
    const csrf = new CsrfTokenManager({
      baseUrl: 'http://localhost:8080',
      cookieManager: cookies,
      bootstrapCsrf: async () => {},
    });

    await expect(csrf.injectHeader('DELETE', {})).rejects.toMatchObject({
      code: 'MOB-CSRF-001',
    });
  });

  it('supports bootstrap lifecycle hooks', async () => {
    const cookies = new InMemoryCookieManager();
    const reasons: string[] = [];

    const csrf = new CsrfTokenManager({
      baseUrl: 'http://localhost:8080',
      cookieManager: cookies,
      bootstrapCsrf: async () => {
        reasons.push('bootstrap');
      },
    });

    await csrf.onAppColdStart();
    await csrf.onLoginSuccess();
    await csrf.onForegroundResume();

    expect(reasons).toHaveLength(3);
  });

  it('forces a fresh csrf bootstrap for retry flows', async () => {
    const cookies = new InMemoryCookieManager();
    const csrf = new CsrfTokenManager({
      baseUrl: 'http://localhost:8080',
      cookieManager: cookies,
      bootstrapCsrf: async () => {
        cookies.setCookie('http://localhost:8080', 'XSRF-TOKEN', 'csrf-refresh');
        return {
          headerName: 'X-CSRF-TOKEN',
          token: 'csrf-refresh',
        };
      },
    });

    await expect(csrf.forceRefresh()).resolves.toEqual({
      headerName: 'X-CSRF-TOKEN',
      token: 'csrf-refresh',
    });
  });
});
