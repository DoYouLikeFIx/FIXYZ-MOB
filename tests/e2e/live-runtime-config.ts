import {
  MobileConfigError,
  assertSafeApiBaseUrl,
  resolveApiBaseUrl,
  type RuntimeTarget,
} from '@/config/environment';
import {
  isRuntimeTarget,
  parseApiIngressMode,
  toBoolean,
  trimToUndefined,
} from '@/config/runtime-option-parsing';

export const resolveLiveHarnessBaseUrl = (): string => {
  const ingressMode = parseApiIngressMode(
    trimToUndefined(process.env.MOB_API_INGRESS_MODE),
    'MOB_API_INGRESS_MODE',
  ) ?? 'direct';
  const explicitOverrideUrl = trimToUndefined(process.env.MOB_API_BASE_URL);
  const liveApiBaseUrl = trimToUndefined(process.env.LIVE_API_BASE_URL);
  const runtimeTarget = trimToUndefined(process.env.MOB_RUNTIME_TARGET);
  const resolvedTarget: RuntimeTarget = isRuntimeTarget(runtimeTarget)
    ? runtimeTarget
    : 'ios-simulator';

  if (ingressMode === 'edge' && explicitOverrideUrl) {
    throw new MobileConfigError(
      'MOB-CONFIG-008',
      'MOB_API_BASE_URL cannot be combined with MOB_API_INGRESS_MODE=edge in the live harness',
    );
  }

  const overrideUrl = explicitOverrideUrl ?? (ingressMode === 'edge' ? undefined : liveApiBaseUrl);

  if (!overrideUrl && ingressMode !== 'edge' && resolvedTarget !== 'physical-device') {
    return '';
  }

  const baseUrl = resolveApiBaseUrl({
    target: resolvedTarget,
    lanIp: trimToUndefined(process.env.MOB_LAN_IP),
    overrideUrl,
    ingressMode,
    edgeBaseUrl: trimToUndefined(process.env.MOB_EDGE_BASE_URL),
  });

  assertSafeApiBaseUrl({
    baseUrl,
    allowInsecureDevBaseUrl: toBoolean(process.env.MOB_ALLOW_INSECURE_DEV_BASE_URL) === true,
    isDevelopmentRuntime: process.env.NODE_ENV === 'development',
  });

  return baseUrl;
};
