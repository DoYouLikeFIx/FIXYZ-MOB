const hoisted = vi.hoisted(() => ({
  getMock: vi.fn(async () => ({})),
  getFromResponseMock: vi.fn(async () => ({})),
}));

vi.mock('@react-native-cookies/cookies', () => ({
  default: {
    get: hoisted.getMock,
    getFromResponse: hoisted.getFromResponseMock,
  },
}));

import { createMobileNetworkRuntime } from '@/network/create-mobile-network-runtime';

describe('createMobileNetworkRuntime', () => {
  beforeEach(() => {
    hoisted.getMock.mockReset();
    hoisted.getMock.mockResolvedValue({});
    hoisted.getFromResponseMock.mockReset();
    hoisted.getFromResponseMock.mockResolvedValue({});
  });

  it('resolves edge mode runtime and bootstraps csrf against the edge base url', async () => {
    const runtime = createMobileNetworkRuntime({
      target: 'ios-simulator',
      ingressMode: 'edge',
      edgeBaseUrl: 'https://edge.fix.example/',
    });

    expect(runtime.baseUrl).toBe('https://edge.fix.example');
    expect(runtime.cookiePolicy).toEqual({
      domain: 'edge.fix.example',
      sameSite: 'None',
      secure: true,
    });

    const bootstrapSpy = vi.spyOn(runtime.bootstrapClient, 'get').mockResolvedValue({
      statusCode: 200,
      body: {
        token: 'edge-csrf-token',
      },
      headers: new Headers(),
    });

    await expect(runtime.csrfManager.onAppColdStart()).resolves.toBeUndefined();

    expect(hoisted.getFromResponseMock).toHaveBeenCalledWith(
      'https://edge.fix.example/api/v1/auth/csrf',
    );
    expect(bootstrapSpy).toHaveBeenCalledWith('/api/v1/auth/csrf');
  });

  it('fails fast for unsafe plaintext physical-device transport without the dev bypass', () => {
    expect(() => createMobileNetworkRuntime({
      target: 'physical-device',
      lanIp: '192.168.0.77',
      isDevelopmentRuntime: true,
      allowInsecureDevBaseUrl: false,
    })).toThrowError(/MOB-CONFIG-004/);
  });

  it('allows unsafe plaintext physical-device transport only with the explicit dev bypass', () => {
    const runtime = createMobileNetworkRuntime({
      target: 'physical-device',
      lanIp: '192.168.0.77',
      isDevelopmentRuntime: true,
      allowInsecureDevBaseUrl: true,
    });

    expect(runtime.baseUrl).toBe('http://192.168.0.77:8080');
  });
});
