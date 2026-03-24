const hoisted = vi.hoisted(() => ({
  launchArgumentsValueMock: vi.fn(() => ({})),
}));

vi.mock('react-native-launch-arguments', () => ({
  LaunchArguments: {
    value: hoisted.launchArgumentsValueMock,
  },
}));

import {
  isMotionDisabled,
  isDevelopmentRuntime,
  resetMobileLaunchArgumentsCache,
  resolveApiIngressMode,
  resolveRuntimeEdgeBaseUrl,
  resolveRuntimeTarget,
  resolveRuntimeUrlOverride,
  shouldAllowInsecureDevBaseUrl,
  shouldEnforceStrictCsrfBootstrap,
  shouldUseQaPlaintextPasswords,
} from '@/config/runtime-options';

describe('runtime options', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRuntimeTarget = process.env.MOB_RUNTIME_TARGET;
  const originalApiBaseUrl = process.env.MOB_API_BASE_URL;
  const originalApiIngressMode = process.env.MOB_API_INGRESS_MODE;
  const originalEdgeBaseUrl = process.env.MOB_EDGE_BASE_URL;
  const originalAllowInsecureDevBaseUrl = process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL;
  const originalStrictCsrfBootstrap = process.env.MOB_STRICT_CSRF_BOOTSTRAP;

  beforeEach(() => {
    hoisted.launchArgumentsValueMock.mockReset();
    hoisted.launchArgumentsValueMock.mockReturnValue({});
    resetMobileLaunchArgumentsCache();

    delete process.env.MOB_RUNTIME_TARGET;
    delete process.env.MOB_API_BASE_URL;
    delete process.env.MOB_API_INGRESS_MODE;
    delete process.env.MOB_EDGE_BASE_URL;
    delete process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL;
    delete process.env.MOB_STRICT_CSRF_BOOTSTRAP;
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    resetMobileLaunchArgumentsCache();

    process.env.NODE_ENV = originalNodeEnv;

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

    if (originalAllowInsecureDevBaseUrl === undefined) {
      delete process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL;
    } else {
      process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL = originalAllowInsecureDevBaseUrl;
    }

    if (originalStrictCsrfBootstrap === undefined) {
      delete process.env.MOB_STRICT_CSRF_BOOTSTRAP;
    } else {
      process.env.MOB_STRICT_CSRF_BOOTSTRAP = originalStrictCsrfBootstrap;
    }
  });

  it('prefers launch arguments over process env for runtime overrides', () => {
    process.env.MOB_RUNTIME_TARGET = 'ios-simulator';
    process.env.MOB_API_BASE_URL = 'http://env-only:8080';
    process.env.MOB_API_INGRESS_MODE = 'direct';
    process.env.MOB_EDGE_BASE_URL = 'https://env-edge.fix.example';
    process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL = 'false';
    hoisted.launchArgumentsValueMock.mockReturnValue({
      mobRuntimeTarget: 'android-emulator',
      mobApiBaseUrl: 'http://launch-override:8080',
      mobApiIngressMode: 'edge',
      mobEdgeBaseUrl: 'https://launch-edge.fix.example',
      mobAllowInsecureDevBaseUrl: 'true',
      mobDisableAnimations: true,
      mobQaPlaintextPasswords: true,
    });
    resetMobileLaunchArgumentsCache();

    expect(resolveRuntimeTarget()).toBe('android-emulator');
    expect(resolveRuntimeUrlOverride()).toBe('http://launch-override:8080');
    expect(resolveApiIngressMode()).toBe('edge');
    expect(resolveRuntimeEdgeBaseUrl()).toBe('https://launch-edge.fix.example');
    expect(shouldAllowInsecureDevBaseUrl()).toBe(true);
    expect(isMotionDisabled()).toBe(true);
    expect(shouldUseQaPlaintextPasswords()).toBe(true);
  });

  it('falls back to safe defaults when launch arguments are unavailable', () => {
    hoisted.launchArgumentsValueMock.mockImplementation(() => {
      throw new Error('native bridge unavailable');
    });
    resetMobileLaunchArgumentsCache();

    expect(resolveRuntimeTarget()).toBe('ios-simulator');
    expect(resolveRuntimeUrlOverride()).toBeUndefined();
    expect(resolveApiIngressMode()).toBe('direct');
    expect(resolveRuntimeEdgeBaseUrl()).toBeUndefined();
    expect(shouldAllowInsecureDevBaseUrl()).toBe(false);
    expect(isMotionDisabled()).toBe(false);
    expect(shouldUseQaPlaintextPasswords()).toBe(false);
  });

  it('throws a deterministic config error when ingress mode is invalid', () => {
    process.env.MOB_API_INGRESS_MODE = 'invalid';

    expect(() => resolveApiIngressMode()).toThrowError(/MOB-CONFIG-005/);
  });

  it('trims empty edge values', () => {
    process.env.MOB_EDGE_BASE_URL = '   ';

    expect(resolveRuntimeEdgeBaseUrl()).toBeUndefined();
  });

  it('ignores insecure base url bypass outside development runtime', () => {
    process.env.NODE_ENV = 'production';
    process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL = 'true';

    expect(isDevelopmentRuntime()).toBe(false);
    expect(shouldAllowInsecureDevBaseUrl()).toBe(false);
  });

  it('lets a boolean false launch arg disable an env-enabled insecure base url bypass', () => {
    process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL = 'true';
    hoisted.launchArgumentsValueMock.mockReturnValue({
      mobAllowInsecureDevBaseUrl: false,
    });
    resetMobileLaunchArgumentsCache();

    expect(shouldAllowInsecureDevBaseUrl()).toBe(false);
  });

  it('resolves strict csrf bootstrap from env override first and production second', () => {
    process.env.MOB_STRICT_CSRF_BOOTSTRAP = 'true';
    expect(shouldEnforceStrictCsrfBootstrap()).toBe(true);

    delete process.env.MOB_STRICT_CSRF_BOOTSTRAP;
    process.env.NODE_ENV = 'production';
    expect(shouldEnforceStrictCsrfBootstrap()).toBe(true);

    process.env.MOB_STRICT_CSRF_BOOTSTRAP = 'false';
    expect(shouldEnforceStrictCsrfBootstrap()).toBe(false);
  });
});
