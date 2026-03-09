import {
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

  it('uses secure policy for physical device hosts', () => {
    expect(resolveSessionCookiePolicy('http://192.168.0.77:8080')).toEqual({
      domain: '192.168.0.77',
      sameSite: 'None',
      secure: true,
    });
  });
});
