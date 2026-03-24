import { resolveLiveHarnessBaseUrl } from './live-runtime-config';

describe('resolveLiveHarnessBaseUrl', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalApiBaseUrl = process.env.MOB_API_BASE_URL;
  const originalApiIngressMode = process.env.MOB_API_INGRESS_MODE;
  const originalEdgeBaseUrl = process.env.MOB_EDGE_BASE_URL;
  const originalLiveApiBaseUrl = process.env.LIVE_API_BASE_URL;
  const originalRuntimeTarget = process.env.MOB_RUNTIME_TARGET;
  const originalLanIp = process.env.MOB_LAN_IP;
  const originalAllowInsecureDevBaseUrl = process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    delete process.env.MOB_API_BASE_URL;
    delete process.env.MOB_API_INGRESS_MODE;
    delete process.env.MOB_EDGE_BASE_URL;
    delete process.env.LIVE_API_BASE_URL;
    delete process.env.MOB_RUNTIME_TARGET;
    delete process.env.MOB_LAN_IP;
    delete process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL;
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalApiBaseUrl === undefined) {
      delete process.env.MOB_API_BASE_URL;
    } else {
      process.env.MOB_API_BASE_URL = originalApiBaseUrl;
    }

    if (originalApiIngressMode === undefined) {
      delete process.env.MOB_API_INGRESS_MODE;
    } else {
      process.env.MOB_API_INGRESS_MODE = originalApiIngressMode;
    }

    if (originalEdgeBaseUrl === undefined) {
      delete process.env.MOB_EDGE_BASE_URL;
    } else {
      process.env.MOB_EDGE_BASE_URL = originalEdgeBaseUrl;
    }

    if (originalLiveApiBaseUrl === undefined) {
      delete process.env.LIVE_API_BASE_URL;
    } else {
      process.env.LIVE_API_BASE_URL = originalLiveApiBaseUrl;
    }

    if (originalRuntimeTarget === undefined) {
      delete process.env.MOB_RUNTIME_TARGET;
    } else {
      process.env.MOB_RUNTIME_TARGET = originalRuntimeTarget;
    }

    if (originalLanIp === undefined) {
      delete process.env.MOB_LAN_IP;
    } else {
      process.env.MOB_LAN_IP = originalLanIp;
    }

    if (originalAllowInsecureDevBaseUrl === undefined) {
      delete process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL;
    } else {
      process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL = originalAllowInsecureDevBaseUrl;
    }
  });

  it('uses LIVE_API_BASE_URL for direct live harness runs', () => {
    process.env.LIVE_API_BASE_URL = 'http://localhost:18080';

    expect(resolveLiveHarnessBaseUrl()).toBe('http://localhost:18080');
  });

  it('ignores LIVE_API_BASE_URL when ingress mode is edge', () => {
    process.env.LIVE_API_BASE_URL = 'http://localhost:18080';
    process.env.MOB_API_INGRESS_MODE = 'edge';
    process.env.MOB_EDGE_BASE_URL = 'https://edge.fix.example';

    expect(resolveLiveHarnessBaseUrl()).toBe('https://edge.fix.example');
  });

  it('fails fast when an explicit override tries to mask the canonical edge lane', () => {
    process.env.MOB_API_BASE_URL = 'https://override.fix.example';
    process.env.MOB_API_INGRESS_MODE = 'edge';
    process.env.MOB_EDGE_BASE_URL = 'https://edge.fix.example';

    expect(() => resolveLiveHarnessBaseUrl()).toThrowError(/MOB-CONFIG-008/);
  });

  it('resolves the direct physical-device lane from MOB_RUNTIME_TARGET and MOB_LAN_IP', () => {
    process.env.MOB_RUNTIME_TARGET = 'physical-device';
    process.env.MOB_LAN_IP = '192.168.0.77';
    process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL = 'true';

    expect(resolveLiveHarnessBaseUrl()).toBe('http://192.168.0.77:8080');
  });

  it('skips when no live lane inputs are configured', () => {
    expect(resolveLiveHarnessBaseUrl()).toBe('');
  });

  it('keeps the plaintext bypass dev-only inside the live harness', () => {
    process.env.NODE_ENV = 'test';
    process.env.LIVE_API_BASE_URL = 'http://192.168.0.77:8080';
    process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL = 'true';

    expect(() => resolveLiveHarnessBaseUrl()).toThrowError(/MOB-CONFIG-004/);
  });

  it('fails fast on invalid ingress mode input', () => {
    process.env.MOB_API_INGRESS_MODE = 'invalid';

    expect(() => resolveLiveHarnessBaseUrl()).toThrowError(/MOB-CONFIG-005/);
  });
});
