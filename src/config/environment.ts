export const DEFAULT_HEALTH_TIMEOUT_MS = 5_000;

export type RuntimeTarget =
  | 'android-emulator'
  | 'ios-simulator'
  | 'physical-device';

export type SameSitePolicy = 'Lax' | 'Strict' | 'None';

export interface SessionCookiePolicy {
  domain: string;
  sameSite: SameSitePolicy;
  secure: boolean;
}

export interface ResolveApiBaseUrlInput {
  target: RuntimeTarget;
  lanIp?: string;
  overrideUrl?: string;
  matrixOverrides?: Partial<Record<RuntimeTarget, string>>;
}

const DEFAULT_HOST_MATRIX: Record<RuntimeTarget, string> = {
  'android-emulator': 'http://10.0.2.2:8080',
  'ios-simulator': 'http://localhost:8080',
  'physical-device': 'http://<LAN_IP>:8080',
};

export class MobileConfigError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = 'MobileConfigError';
    this.code = code;
  }
}

const normalizeBaseUrl = (value: string): string => value.trim().replace(/\/+$/, '');

const resolvePhysicalDeviceUrl = (input: ResolveApiBaseUrlInput): string => {
  if (input.matrixOverrides?.['physical-device']) {
    return normalizeBaseUrl(input.matrixOverrides['physical-device']);
  }

  if (input.lanIp) {
    return `http://${input.lanIp}:8080`;
  }

  throw new MobileConfigError(
    'MOB-CONFIG-001',
    'Physical device host requires lanIp or explicit overrideUrl',
  );
};

export const resolveApiBaseUrl = (input: ResolveApiBaseUrlInput): string => {
  if (input.overrideUrl) {
    return normalizeBaseUrl(input.overrideUrl);
  }

  if (input.target === 'physical-device') {
    return resolvePhysicalDeviceUrl(input);
  }

  const targetOverride = input.matrixOverrides?.[input.target];
  if (targetOverride) {
    return normalizeBaseUrl(targetOverride);
  }

  return DEFAULT_HOST_MATRIX[input.target];
};

export const resolveSessionCookiePolicy = (baseUrl: string): SessionCookiePolicy => {
  const parsed = new URL(baseUrl);
  const isSimulatorHost = parsed.hostname === 'localhost' || parsed.hostname === '10.0.2.2';

  if (isSimulatorHost) {
    return {
      domain: parsed.hostname,
      sameSite: 'Lax',
      secure: false,
    };
  }

  return {
    domain: parsed.hostname,
    sameSite: 'None',
    secure: true,
  };
};
