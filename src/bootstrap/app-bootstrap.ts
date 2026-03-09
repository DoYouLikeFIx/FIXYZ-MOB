import type { CsrfTokenManager } from '../network/csrf';
import { checkHealth } from '../network/health';
import type { HealthClient } from '../network/health';
import type { NormalizedHttpError } from '../network/types';

const isMissingCsrfEndpointError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const status = (error as Partial<NormalizedHttpError>).status;
  return status === 404;
};

export interface AppBootstrapRuntime {
  baseUrl: string;
  client: HealthClient;
  csrfManager: Pick<CsrfTokenManager, 'onAppColdStart'>;
  strictCsrfBootstrap?: boolean;
}

const createDefaultRuntime = async (): Promise<AppBootstrapRuntime> => {
  const { createMobileNetworkRuntime } = await import('../network/create-mobile-network-runtime');
  const runtime = createMobileNetworkRuntime();

  return {
    baseUrl: runtime.baseUrl,
    client: runtime.client,
    csrfManager: runtime.csrfManager,
  };
};

export const bootstrapAppSession = async (
  runtime?: AppBootstrapRuntime,
): Promise<void> => {
  const resolvedRuntime = runtime ?? await createDefaultRuntime();

  try {
    await resolvedRuntime.csrfManager.onAppColdStart();
  } catch (error: unknown) {
    const strictCsrfBootstrap =
      resolvedRuntime.strictCsrfBootstrap ??
      (await import('../config/runtime-options')).shouldEnforceStrictCsrfBootstrap();

    if (
      !strictCsrfBootstrap &&
      isMissingCsrfEndpointError(error)
    ) {
      console.info(
        `[MOB] Skipping CSRF bootstrap at ${resolvedRuntime.baseUrl}/api/v1/auth/csrf because endpoint returned 404.`,
      );
    } else {
      throw error;
    }
  }

  await checkHealth(resolvedRuntime.client);
};
