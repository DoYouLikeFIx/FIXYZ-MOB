const hoisted = vi.hoisted(() => ({
  resolveApiBaseUrlMock: vi.fn(() => 'http://localhost:8080'),
  resolveSessionCookiePolicyMock: vi.fn(() => ({
    domain: 'localhost',
    sameSite: 'Lax' as const,
    secure: false,
  })),
  checkHealthMock: vi.fn(async () => ({
    statusCode: 200,
    body: { status: 'UP' },
  })),
  state: {
    coldStartErrorStatus: null as 404 | 500 | null,
  },
}));

vi.mock('../config/environment', () => ({
  resolveApiBaseUrl: hoisted.resolveApiBaseUrlMock,
  resolveSessionCookiePolicy: hoisted.resolveSessionCookiePolicyMock,
}));

vi.mock('../network/health', () => ({
  checkHealth: hoisted.checkHealthMock,
}));

vi.mock('../network/http-client', () => ({
  HttpClient: class {
    constructor(input: unknown) {
      void input;
    }

    async get(path: string): Promise<{ statusCode: number; body: unknown }> {
      void path;
      return {
        statusCode: 200,
        body: {
          success: true,
          data: {},
          error: null,
        },
      };
    }
  },
}));

vi.mock('../network/csrf', () => ({
  CsrfTokenManager: class {
    constructor(input: unknown) {
      void input;
    }

    async onAppColdStart(): Promise<void> {
      if (hoisted.state.coldStartErrorStatus === null) {
        return;
      }

      const error = new Error('bootstrap failure') as Error & { status: number };
      error.status = hoisted.state.coldStartErrorStatus;
      throw error;
    }
  },
}));

vi.mock('../network/react-native-cookie-manager', () => ({
  ReactNativeCookieReader: class {},
}));

import { bootstrapAppSession } from '@/bootstrap/app-bootstrap';

describe('bootstrap app session', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalStrictCsrf = process.env.MOB_STRICT_CSRF_BOOTSTRAP;
  const originalRuntimeTarget = process.env.MOB_RUNTIME_TARGET;
  const originalApiBaseUrl = process.env.MOB_API_BASE_URL;
  const originalLanIp = process.env.MOB_LAN_IP;

  beforeEach(() => {
    hoisted.state.coldStartErrorStatus = null;
    hoisted.resolveApiBaseUrlMock.mockClear();
    hoisted.resolveSessionCookiePolicyMock.mockClear();
    hoisted.checkHealthMock.mockClear();

    process.env.NODE_ENV = 'development';
    delete process.env.MOB_STRICT_CSRF_BOOTSTRAP;
    delete process.env.MOB_RUNTIME_TARGET;
    delete process.env.MOB_API_BASE_URL;
    delete process.env.MOB_LAN_IP;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;

    if (originalStrictCsrf === undefined) {
      delete process.env.MOB_STRICT_CSRF_BOOTSTRAP;
    } else {
      process.env.MOB_STRICT_CSRF_BOOTSTRAP = originalStrictCsrf;
    }

    if (originalRuntimeTarget === undefined) {
      delete process.env.MOB_RUNTIME_TARGET;
    } else {
      process.env.MOB_RUNTIME_TARGET = originalRuntimeTarget;
    }

    if (originalApiBaseUrl === undefined) {
      delete process.env.MOB_API_BASE_URL;
    } else {
      process.env.MOB_API_BASE_URL = originalApiBaseUrl;
    }

    if (originalLanIp === undefined) {
      delete process.env.MOB_LAN_IP;
    } else {
      process.env.MOB_LAN_IP = originalLanIp;
    }

    vi.restoreAllMocks();
  });

  it('continues bootstrap in non-strict mode when CSRF endpoint returns 404', async () => {
    hoisted.state.coldStartErrorStatus = 404;
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await expect(bootstrapAppSession()).resolves.toBeUndefined();

    expect(hoisted.resolveApiBaseUrlMock).toHaveBeenCalledWith({
      target: 'ios-simulator',
      lanIp: undefined,
      overrideUrl: undefined,
    });
    expect(hoisted.checkHealthMock).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/csrf'),
    );
  });

  it('fails bootstrap in strict mode when CSRF endpoint returns 404', async () => {
    hoisted.state.coldStartErrorStatus = 404;
    process.env.MOB_STRICT_CSRF_BOOTSTRAP = 'true';

    await expect(bootstrapAppSession()).rejects.toMatchObject({ status: 404 });
    expect(hoisted.checkHealthMock).not.toHaveBeenCalled();
  });

  it('fails bootstrap by default in production when CSRF endpoint returns 404', async () => {
    hoisted.state.coldStartErrorStatus = 404;
    process.env.NODE_ENV = 'production';

    await expect(bootstrapAppSession()).rejects.toMatchObject({ status: 404 });
    expect(hoisted.checkHealthMock).not.toHaveBeenCalled();
  });

  it('continues bootstrap in production when strict mode is explicitly disabled', async () => {
    hoisted.state.coldStartErrorStatus = 404;
    process.env.NODE_ENV = 'production';
    process.env.MOB_STRICT_CSRF_BOOTSTRAP = 'false';
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    await expect(bootstrapAppSession()).resolves.toBeUndefined();

    expect(hoisted.checkHealthMock).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledTimes(1);
  });

  it('fails bootstrap for non-404 CSRF errors even in non-strict mode', async () => {
    hoisted.state.coldStartErrorStatus = 500;

    await expect(bootstrapAppSession()).rejects.toMatchObject({ status: 500 });
    expect(hoisted.checkHealthMock).not.toHaveBeenCalled();
  });
});
