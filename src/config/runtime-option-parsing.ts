import { MobileConfigError, type ApiIngressMode, type RuntimeTarget } from './environment';

export const trimToUndefined = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const isRuntimeTarget = (value: string | undefined): value is RuntimeTarget =>
  value === 'android-emulator'
  || value === 'ios-simulator'
  || value === 'physical-device';

export const isApiIngressMode = (value: string | undefined): value is ApiIngressMode =>
  value === 'direct' || value === 'edge';

export const toBoolean = (value: string | undefined): boolean | undefined => {
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

export const parseApiIngressMode = (
  value: string | undefined,
  source = 'mobApiIngressMode/MOB_API_INGRESS_MODE',
): ApiIngressMode | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (isApiIngressMode(value)) {
    return value;
  }

  throw new MobileConfigError(
    'MOB-CONFIG-005',
    `${source} must be either direct or edge`,
  );
};
