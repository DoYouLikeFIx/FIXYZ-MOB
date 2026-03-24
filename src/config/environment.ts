export const DEFAULT_HEALTH_TIMEOUT_MS = 5_000;

export type RuntimeTarget =
  | 'android-emulator'
  | 'ios-simulator'
  | 'physical-device';

export type ApiIngressMode = 'direct' | 'edge';

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
  ingressMode?: ApiIngressMode;
  edgeBaseUrl?: string;
  matrixOverrides?: Partial<Record<RuntimeTarget, string>>;
}

export interface AssertSafeApiBaseUrlInput {
  baseUrl: string;
  allowInsecureDevBaseUrl?: boolean;
  isDevelopmentRuntime?: boolean;
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

const normalizeOptionalBaseUrl = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = normalizeBaseUrl(value);
  return normalized.length > 0 ? normalized : undefined;
};

const isLocalSafeHost = (hostname: string): boolean =>
  hostname === 'localhost'
  || hostname === '127.0.0.1'
  || hostname === '[::1]'
  || hostname === '10.0.2.2';

const parseAbsoluteUrl = (
  value: string,
  code: string,
  message: string,
): URL => {
  try {
    return new URL(value);
  } catch {
    throw new MobileConfigError(code, message);
  }
};

const assertHttpTransport = (
  parsed: URL,
  code: string,
  message: string,
): void => {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new MobileConfigError(code, message);
  }
};

const assertNoCredentialsSearchOrHash = (
  parsed: URL,
  code: string,
  message: string,
): void => {
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new MobileConfigError(code, message);
  }
};

const validateOverrideBaseUrl = (value: string): string => {
  const parsed = parseAbsoluteUrl(
    value,
    'MOB-CONFIG-007',
    'MOB_API_BASE_URL must be a valid http or https URL',
  );

  assertHttpTransport(
    parsed,
    'MOB-CONFIG-007',
    'MOB_API_BASE_URL must use http or https transport',
  );
  assertNoCredentialsSearchOrHash(
    parsed,
    'MOB-CONFIG-007',
    'MOB_API_BASE_URL must not include credentials, query parameters, or fragments',
  );

  return normalizeBaseUrl(parsed.href);
};

const normalizeLanHost = (value: string | undefined): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const candidate = value.trim();
  if (!candidate) {
    return undefined;
  }

  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate);
  const hasInvalidDelimiters = /[/?#@\s]/.test(candidate);

  if (hasScheme || hasInvalidDelimiters) {
    throw new MobileConfigError(
      'MOB-CONFIG-006',
      'MOB_LAN_IP must be a bare IPv4, IPv6, or hostname without scheme, path, query, fragment, or credentials',
    );
  }

  const host = candidate.includes(':') && !candidate.startsWith('[')
    ? `[${candidate}]`
    : candidate;

  parseAbsoluteUrl(
    `http://${host}:8080`,
    'MOB-CONFIG-006',
    'MOB_LAN_IP must be a valid IPv4, IPv6, or hostname without a port',
  );

  return host;
};

const resolveEdgeBaseUrl = (input: ResolveApiBaseUrlInput): string => {
  const edgeBaseUrl = normalizeOptionalBaseUrl(input.edgeBaseUrl);

  if (!edgeBaseUrl) {
    throw new MobileConfigError(
      'MOB-CONFIG-002',
      'Edge ingress requires MOB_EDGE_BASE_URL',
    );
  }

  const parsed = parseAbsoluteUrl(
    edgeBaseUrl,
    'MOB-CONFIG-003',
    'Edge base URL must be a valid https URL',
  );

  if (parsed.protocol !== 'https:') {
    throw new MobileConfigError(
      'MOB-CONFIG-003',
      'Edge base URL must use https transport',
    );
  }

  const isOriginOnly = parsed.pathname === '/'
    && !parsed.search
    && !parsed.hash
    && !parsed.username
    && !parsed.password;

  if (!isOriginOnly) {
    throw new MobileConfigError(
      'MOB-CONFIG-003',
      'Edge base URL must be an https origin without path, query, fragment, or credentials',
    );
  }

  return parsed.origin;
};

const resolvePhysicalDeviceUrl = (input: ResolveApiBaseUrlInput): string => {
  const targetOverride = normalizeOptionalBaseUrl(input.matrixOverrides?.['physical-device']);

  if (targetOverride) {
    return validateOverrideBaseUrl(targetOverride);
  }

  const lanHost = normalizeLanHost(input.lanIp);

  if (lanHost) {
    return `http://${lanHost}:8080`;
  }

  throw new MobileConfigError(
    'MOB-CONFIG-001',
    'Physical device host requires lanIp or explicit overrideUrl',
  );
};

export const resolveApiBaseUrl = (input: ResolveApiBaseUrlInput): string => {
  const overrideUrl = normalizeOptionalBaseUrl(input.overrideUrl);

  if (overrideUrl) {
    return validateOverrideBaseUrl(overrideUrl);
  }

  if (input.ingressMode === 'edge') {
    return resolveEdgeBaseUrl(input);
  }

  if (input.target === 'physical-device') {
    return resolvePhysicalDeviceUrl(input);
  }

  const targetOverride = normalizeOptionalBaseUrl(input.matrixOverrides?.[input.target]);
  if (targetOverride) {
    return validateOverrideBaseUrl(targetOverride);
  }

  return DEFAULT_HOST_MATRIX[input.target];
};

export const resolveSessionCookiePolicy = (baseUrl: string): SessionCookiePolicy => {
  const parsed = new URL(baseUrl);

  if (parsed.protocol === 'https:') {
    return {
      domain: parsed.hostname,
      sameSite: 'None',
      secure: true,
    };
  }

  if (isLocalSafeHost(parsed.hostname)) {
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

export const assertSafeApiBaseUrl = ({
  baseUrl,
  allowInsecureDevBaseUrl = false,
  isDevelopmentRuntime = false,
}: AssertSafeApiBaseUrlInput): void => {
  const parsed = new URL(baseUrl);
  const cookiePolicy = resolveSessionCookiePolicy(baseUrl);

  if (!cookiePolicy.secure || parsed.protocol === 'https:') {
    return;
  }

  if (allowInsecureDevBaseUrl && isDevelopmentRuntime) {
    return;
  }

  throw new MobileConfigError(
    'MOB-CONFIG-004',
    'Unsafe plaintext transport is not allowed for non-localhost mobile base URLs without MOB_ALLOW_INSECURE_DEV_BASE_URL=true in development runtime',
  );
};
