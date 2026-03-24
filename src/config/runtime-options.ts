import { LaunchArguments } from 'react-native-launch-arguments';

import { type ApiIngressMode, type RuntimeTarget } from './environment';
import {
  isRuntimeTarget,
  parseApiIngressMode,
  toBoolean,
  trimToUndefined,
} from './runtime-option-parsing';

declare const __DEV__: boolean;

export interface MobileLaunchArguments {
  mobApiBaseUrl?: string;
  mobApiIngressMode?: ApiIngressMode | string;
  mobEdgeBaseUrl?: string;
  mobAllowInsecureDevBaseUrl?: boolean | string;
  mobRuntimeTarget?: RuntimeTarget;
  mobDisableAnimations?: boolean | string;
  mobHideDevWarningsOverlay?: boolean | string;
  mobDemoOrderOtpCode?: string;
  mobQaPlaintextPasswords?: boolean | string;
}

let cachedArguments: MobileLaunchArguments | null = null;

const resolveBooleanLaunchPreference = (
  launchValue: boolean | string | undefined,
  envValue: string | undefined,
): boolean | undefined => {
  if (typeof launchValue === 'boolean') {
    return launchValue;
  }

  if (typeof launchValue === 'string') {
    return toBoolean(launchValue);
  }

  return toBoolean(envValue);
};

export const isDevelopmentRuntime = (): boolean => {
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
  trimToUndefined(getMobileLaunchArguments().mobApiBaseUrl)
  ?? trimToUndefined(process.env.MOB_API_BASE_URL);

export const resolveApiIngressMode = (): ApiIngressMode => {
  const launchValue = trimToUndefined(
    typeof getMobileLaunchArguments().mobApiIngressMode === 'string'
      ? getMobileLaunchArguments().mobApiIngressMode
      : undefined,
  );
  const envValue = trimToUndefined(process.env.MOB_API_INGRESS_MODE);
  const value = launchValue ?? envValue;

  return parseApiIngressMode(value) ?? 'direct';
};

export const resolveRuntimeEdgeBaseUrl = (): string | undefined =>
  trimToUndefined(getMobileLaunchArguments().mobEdgeBaseUrl)
  ?? trimToUndefined(process.env.MOB_EDGE_BASE_URL);

export const shouldAllowInsecureDevBaseUrl = (): boolean => {
  const { mobAllowInsecureDevBaseUrl } = getMobileLaunchArguments();
  const resolvedPreference = resolveBooleanLaunchPreference(
    mobAllowInsecureDevBaseUrl,
    process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL,
  );

  return isDevelopmentRuntime() && resolvedPreference === true;
};

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

export const shouldHideDevWarningsOverlay = (): boolean => {
  if (!isDevelopmentRuntime()) {
    return false;
  }

  const { mobHideDevWarningsOverlay } = getMobileLaunchArguments();

  return mobHideDevWarningsOverlay === true
    || toBoolean(
      typeof mobHideDevWarningsOverlay === 'string'
        ? mobHideDevWarningsOverlay
        : undefined,
    ) === true;
};

export const resolveDemoOrderOtpCode = (): string | null => {
  if (!isDevelopmentRuntime()) {
    return null;
  }

  const { mobDemoOrderOtpCode } = getMobileLaunchArguments();
  if (typeof mobDemoOrderOtpCode !== 'string') {
    return null;
  }

  const digitsOnly = mobDemoOrderOtpCode.replace(/\D/g, '').slice(0, 6);
  return digitsOnly.length === 6 ? digitsOnly : null;
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
