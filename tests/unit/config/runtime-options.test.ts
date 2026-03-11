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
  resetMobileLaunchArgumentsCache,
  resolveRuntimeTarget,
  resolveRuntimeUrlOverride,
  shouldEnforceStrictCsrfBootstrap,
  shouldUseQaPlaintextPasswords,
} from '@/config/runtime-options';

describe('runtime options', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalRuntimeTarget = process.env.MOB_RUNTIME_TARGET;
  const originalApiBaseUrl = process.env.MOB_API_BASE_URL;
  const originalStrictCsrfBootstrap = process.env.MOB_STRICT_CSRF_BOOTSTRAP;

  beforeEach(() => {
    hoisted.launchArgumentsValueMock.mockReset();
    hoisted.launchArgumentsValueMock.mockReturnValue({});
    resetMobileLaunchArgumentsCache();

    delete process.env.MOB_RUNTIME_TARGET;
    delete process.env.MOB_API_BASE_URL;
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

    if (originalStrictCsrfBootstrap === undefined) {
      delete process.env.MOB_STRICT_CSRF_BOOTSTRAP;
    } else {
      process.env.MOB_STRICT_CSRF_BOOTSTRAP = originalStrictCsrfBootstrap;
    }
  });

  it('prefers launch arguments over process env for runtime overrides', () => {
    process.env.MOB_RUNTIME_TARGET = 'ios-simulator';
    process.env.MOB_API_BASE_URL = 'http://env-only:8080';
    hoisted.launchArgumentsValueMock.mockReturnValue({
      mobRuntimeTarget: 'android-emulator',
      mobApiBaseUrl: 'http://launch-override:8080',
      mobDisableAnimations: true,
      mobQaPlaintextPasswords: true,
    });
    resetMobileLaunchArgumentsCache();

    expect(resolveRuntimeTarget()).toBe('android-emulator');
    expect(resolveRuntimeUrlOverride()).toBe('http://launch-override:8080');
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
    expect(isMotionDisabled()).toBe(false);
    expect(shouldUseQaPlaintextPasswords()).toBe(false);
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
