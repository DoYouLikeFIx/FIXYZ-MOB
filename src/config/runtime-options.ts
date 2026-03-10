import { LaunchArguments } from 'react-native-launch-arguments';

import type { RuntimeTarget } from './environment';

declare const __DEV__: boolean;

export interface MobileLaunchArguments {
  mobApiBaseUrl?: string;
  mobRuntimeTarget?: RuntimeTarget;
  mobDisableAnimations?: boolean | string;
  mobQaPlaintextPasswords?: boolean | string;
}

let cachedArguments: MobileLaunchArguments | null = null;

const isRuntimeTarget = (value: string | undefined): value is RuntimeTarget =>
  value === 'android-emulator' ||
  value === 'ios-simulator' ||
  value === 'physical-device';

const toBoolean = (value: string | undefined): boolean | undefined => {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }

  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }

  return undefined;
};

const isDevelopmentRuntime = (): boolean => {
  if (typeof __DEV__ !== 'undefined') {
    return __DEV__;
  }

  return process.env.NODE_ENV !== 'production';
};

export const getMobileLaunchArguments = (): MobileLaunchArguments => {
  if (cachedArguments) {
    return cachedArguments;
  }

  try {
    cachedArguments = LaunchArguments.value<MobileLaunchArguments>() ?? {};
  } catch {
    cachedArguments = {};
  }

  return cachedArguments;
};

export const resolveRuntimeTarget = (): RuntimeTarget => {
  const value = getMobileLaunchArguments().mobRuntimeTarget ?? process.env.MOB_RUNTIME_TARGET;

  return isRuntimeTarget(value) ? value : 'ios-simulator';
};

export const resolveRuntimeUrlOverride = (): string | undefined =>
  getMobileLaunchArguments().mobApiBaseUrl ?? process.env.MOB_API_BASE_URL;

export const isMotionDisabled = (): boolean => {
  const { mobDisableAnimations } = getMobileLaunchArguments();

  return mobDisableAnimations === true
    || toBoolean(
      typeof mobDisableAnimations === 'string' ? mobDisableAnimations : undefined,
    ) === true;
};

export const shouldUseQaPlaintextPasswords = (): boolean => {
  const { mobQaPlaintextPasswords } = getMobileLaunchArguments();

  return isDevelopmentRuntime() && (
    mobQaPlaintextPasswords === true
    || toBoolean(
      typeof mobQaPlaintextPasswords === 'string' ? mobQaPlaintextPasswords : undefined,
    ) === true
  );
};

export const shouldEnforceStrictCsrfBootstrap = (): boolean => {
  const override = toBoolean(process.env.MOB_STRICT_CSRF_BOOTSTRAP);

  if (override !== undefined) {
    return override;
  }

  return process.env.NODE_ENV === 'production';
};

export const resetMobileLaunchArgumentsCache = () => {
  cachedArguments = null;
};
