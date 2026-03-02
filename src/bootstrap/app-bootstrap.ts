import {
  resolveApiBaseUrl,
  resolveSessionCookiePolicy,
  type RuntimeTarget,
} from '../config/environment';
import { CsrfTokenManager } from '../network/csrf';
import { checkHealth } from '../network/health';
import { HttpClient } from '../network/http-client';
import { ReactNativeCookieReader } from '../network/react-native-cookie-manager';
import type { NormalizedHttpError } from '../network/types';

const getRuntimeTarget = (): RuntimeTarget => {
  const value = process.env.MOB_RUNTIME_TARGET;

  if (
    value === 'android-emulator' ||
    value === 'ios-simulator' ||
    value === 'physical-device'
  ) {
    return value;
  }

  return 'ios-simulator';
};

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

const shouldEnforceStrictCsrfBootstrap = (): boolean => {
  const override = toBoolean(process.env.MOB_STRICT_CSRF_BOOTSTRAP);

  if (override !== undefined) {
    return override;
  }

  return process.env.NODE_ENV === 'production';
};

const isMissingCsrfEndpointError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const status = (error as Partial<NormalizedHttpError>).status;
  return status === 404;
};

export const bootstrapAppSession = async (): Promise<void> => {
  const target = getRuntimeTarget();
  const baseUrl = resolveApiBaseUrl({
    target,
    lanIp: process.env.MOB_LAN_IP,
    overrideUrl: process.env.MOB_API_BASE_URL,
  });

  const cookiePolicy = resolveSessionCookiePolicy(baseUrl);
  const cookieReader = new ReactNativeCookieReader();
  const bootstrapClient = new HttpClient({
    baseUrl,
    cookiePolicy,
  });

  const csrf = new CsrfTokenManager({
    baseUrl,
    cookieManager: cookieReader,
    bootstrapCsrf: async () => {
      await bootstrapClient.get('/api/v1/auth/csrf');
    },
  });

  const client = new HttpClient({
    baseUrl,
    csrfManager: csrf,
    cookiePolicy,
  });

  try {
    await csrf.onAppColdStart();
  } catch (error: unknown) {
    if (
      !shouldEnforceStrictCsrfBootstrap() &&
      isMissingCsrfEndpointError(error)
    ) {
      console.info(
        `[MOB] Skipping CSRF bootstrap at ${baseUrl}/api/v1/auth/csrf because endpoint returned 404.`,
      );
    } else {
      throw error;
    }
  }

  await checkHealth(client);
};
