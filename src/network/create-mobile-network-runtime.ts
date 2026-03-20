import CookieManager from '@react-native-cookies/cookies';

import {
  resolveApiBaseUrl,
  resolveSessionCookiePolicy,
  type RuntimeTarget,
} from '../config/environment';
import {
  resolveRuntimeTarget,
  resolveRuntimeUrlOverride,
} from '../config/runtime-options';

import { CsrfTokenManager, type CsrfBootstrapPayload } from './csrf';
import { HttpClient } from './http-client';
import { ReactNativeCookieReader } from './react-native-cookie-manager';

interface CreateMobileNetworkRuntimeInput {
  lanIp?: string;
  target?: RuntimeTarget;
  overrideUrl?: string;
}

type CookieManagerBridge = {
  getFromResponse?: (url: string) => Promise<unknown>;
};

let cookieManagerBridge: CookieManagerBridge | undefined;

const resolveCookieManagerBridge = (): CookieManagerBridge | undefined => {
  if (cookieManagerBridge !== undefined) {
    return cookieManagerBridge;
  }

  try {
    cookieManagerBridge = CookieManager as CookieManagerBridge;
  } catch {
    cookieManagerBridge = undefined;
  }

  return cookieManagerBridge;
};

const primeSessionCookie = async (url: string): Promise<void> => {
  const cookieManager = resolveCookieManagerBridge();

  if (!cookieManager?.getFromResponse) {
    return;
  }

  try {
    await cookieManager.getFromResponse(url);
  } catch {
    // Ignore cookie priming failures and fall back to the standard bootstrap fetch.
  }
};

export const createMobileNetworkRuntime = (
  input: CreateMobileNetworkRuntimeInput = {},
) => {
  const target = input.target ?? resolveRuntimeTarget();
  const baseUrl = resolveApiBaseUrl({
    target,
    lanIp: input.lanIp ?? process.env.MOB_LAN_IP,
    overrideUrl: input.overrideUrl ?? resolveRuntimeUrlOverride(),
  });
  const cookiePolicy = resolveSessionCookiePolicy(baseUrl);
  const cookieReader = new ReactNativeCookieReader();
  const bootstrapClient = new HttpClient({
    baseUrl,
    cookiePolicy,
  });

  const csrfManager = new CsrfTokenManager({
    baseUrl,
    cookieManager: cookieReader,
    bootstrapCsrf: async () => {
      await primeSessionCookie(`${baseUrl}/api/v1/auth/csrf`);
      const response = await bootstrapClient.get<CsrfBootstrapPayload>('/api/v1/auth/csrf');
      return response.body;
    },
  });

  const client = new HttpClient({
    baseUrl,
    csrfManager,
    cookiePolicy,
  });

  return {
    target,
    baseUrl,
    bootstrapClient,
    client,
    cookiePolicy,
    csrfManager,
  };
};
