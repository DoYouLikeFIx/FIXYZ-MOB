import {
  assertSafeApiBaseUrl,
  DEFAULT_HEALTH_TIMEOUT_MS,
  resolveApiBaseUrl,
  resolveSessionCookiePolicy,
} from '@/config/environment';

describe('environment host resolution', () => {
  it('resolves host matrix defaults', () => {
    expect(resolveApiBaseUrl({ target: 'android-emulator' })).toBe('http://10.0.2.2:8080');
    expect(resolveApiBaseUrl({ target: 'ios-simulator' })).toBe('http://localhost:8080');
    expect(resolveApiBaseUrl({ target: 'physical-device', lanIp: '192.168.0.77' })).toBe(
      'http://192.168.0.77:8080',
    );
  });

  it('supports explicit override', () => {
    expect(
      resolveApiBaseUrl({
        target: 'android-emulator',
        overrideUrl: 'http://devbox.local:8080',
      }),
    ).toBe('http://devbox.local:8080');
  });

  it('throws deterministic error when physical device lan ip is missing', () => {
    expect(() => resolveApiBaseUrl({ target: 'physical-device' })).toThrowError(
      /MOB-CONFIG-001/,
    );
  });

  it('resolves a configured https edge base url when ingress mode is edge', () => {
    expect(
      resolveApiBaseUrl({
        target: 'ios-simulator',
        ingressMode: 'edge',
        edgeBaseUrl: 'https://edge.fix.example///',
      }),
    ).toBe('https://edge.fix.example');
  });

  it('throws deterministic error when edge mode is selected without edge base url', () => {
    expect(() => resolveApiBaseUrl({
      target: 'ios-simulator',
      ingressMode: 'edge',
    })).toThrowError(/MOB-CONFIG-002/);
  });

  it('throws deterministic error when edge mode base url is malformed or not https', () => {
    expect(() => resolveApiBaseUrl({
      target: 'ios-simulator',
      ingressMode: 'edge',
      edgeBaseUrl: 'https//missing-colon.example',
    })).toThrowError(/MOB-CONFIG-003/);

    expect(() => resolveApiBaseUrl({
      target: 'ios-simulator',
      ingressMode: 'edge',
      edgeBaseUrl: 'http://edge.fix.example',
    })).toThrowError(/MOB-CONFIG-003/);
  });

  it('rejects https edge values that are not bare origins', () => {
    expect(() => resolveApiBaseUrl({
      target: 'ios-simulator',
      ingressMode: 'edge',
      edgeBaseUrl: 'https://edge.fix.example/prefix',
    })).toThrowError(/MOB-CONFIG-003/);

    expect(() => resolveApiBaseUrl({
      target: 'ios-simulator',
      ingressMode: 'edge',
      edgeBaseUrl: 'https://edge.fix.example?via=query',
    })).toThrowError(/MOB-CONFIG-003/);
  });

  it('rejects malformed physical-device lan hosts', () => {
    expect(() => resolveApiBaseUrl({
      target: 'physical-device',
      lanIp: 'http://192.168.0.77',
    })).toThrowError(/MOB-CONFIG-006/);
  });

  it('supports loopback IPv4 and IPv6 physical-device hosts', () => {
    expect(resolveApiBaseUrl({
      target: 'physical-device',
      lanIp: '127.0.0.1',
    })).toBe('http://127.0.0.1:8080');

    expect(resolveApiBaseUrl({
      target: 'physical-device',
      lanIp: '::1',
    })).toBe('http://[::1]:8080');
  });

  it('rejects malformed explicit override urls with a deterministic config error', () => {
    expect(() => resolveApiBaseUrl({
      target: 'ios-simulator',
      overrideUrl: 'localhost:8080',
    })).toThrowError(/MOB-CONFIG-007/);

    expect(() => resolveApiBaseUrl({
      target: 'ios-simulator',
      overrideUrl: 'https://edge.fix.example?via=query',
    })).toThrowError(/MOB-CONFIG-007/);
  });

  it('uses a 5 second health timeout', () => {
    expect(DEFAULT_HEALTH_TIMEOUT_MS).toBe(5_000);
  });
});

describe('session cookie policy', () => {
  it('uses local-safe policy for simulator hosts', () => {
    expect(resolveSessionCookiePolicy('http://localhost:8080')).toEqual({
      domain: 'localhost',
      sameSite: 'Lax',
      secure: false,
    });
  });

  it('treats loopback aliases as local-safe and upgrades https localhost to secure cookies', () => {
    expect(resolveSessionCookiePolicy('http://127.0.0.1:8080')).toEqual({
      domain: '127.0.0.1',
      sameSite: 'Lax',
      secure: false,
    });

    expect(resolveSessionCookiePolicy('http://[::1]:8080')).toEqual({
      domain: '[::1]',
      sameSite: 'Lax',
      secure: false,
    });

    expect(resolveSessionCookiePolicy('https://localhost:8443')).toEqual({
      domain: 'localhost',
      sameSite: 'None',
      secure: true,
    });
  });

  it('uses secure policy for physical device hosts', () => {
    expect(resolveSessionCookiePolicy('http://192.168.0.77:8080')).toEqual({
      domain: '192.168.0.77',
      sameSite: 'None',
      secure: true,
    });
  });
});

describe('transport safety', () => {
  it('fails fast on plaintext non-localhost transport when secure cookies would be required', () => {
    expect(() => assertSafeApiBaseUrl({
      baseUrl: 'http://192.168.0.77:8080',
      isDevelopmentRuntime: true,
      allowInsecureDevBaseUrl: false,
    })).toThrowError(/MOB-CONFIG-004/);
  });

  it('allows insecure non-localhost transport only with the explicit dev-only bypass', () => {
    expect(() => assertSafeApiBaseUrl({
      baseUrl: 'http://192.168.0.77:8080',
      isDevelopmentRuntime: true,
      allowInsecureDevBaseUrl: true,
    })).not.toThrow();
  });

  it('allows plaintext loopback aliases without the explicit bypass', () => {
    expect(() => assertSafeApiBaseUrl({
      baseUrl: 'http://127.0.0.1:8080',
      isDevelopmentRuntime: false,
      allowInsecureDevBaseUrl: false,
    })).not.toThrow();

    expect(() => assertSafeApiBaseUrl({
      baseUrl: 'http://[::1]:8080',
      isDevelopmentRuntime: false,
      allowInsecureDevBaseUrl: false,
    })).not.toThrow();
  });

  it('ignores the bypass outside development runtime', () => {
    expect(() => assertSafeApiBaseUrl({
      baseUrl: 'http://192.168.0.77:8080',
      isDevelopmentRuntime: false,
      allowInsecureDevBaseUrl: true,
    })).toThrowError(/MOB-CONFIG-004/);
  });
});
