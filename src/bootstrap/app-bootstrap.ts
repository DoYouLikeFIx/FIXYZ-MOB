import { shouldEnforceStrictCsrfBootstrap } from '../config/runtime-options';
import { checkHealth } from '../network/health';
import { createMobileNetworkRuntime } from '../network/create-mobile-network-runtime';
import type { NormalizedHttpError } from '../network/types';

const isMissingCsrfEndpointError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const status = (error as Partial<NormalizedHttpError>).status;
  return status === 404;
};

export const bootstrapAppSession = async (): Promise<void> => {
  const runtime = createMobileNetworkRuntime();

  try {
    await runtime.csrfManager.onAppColdStart();
  } catch (error: unknown) {
    if (
      !shouldEnforceStrictCsrfBootstrap() &&
      isMissingCsrfEndpointError(error)
    ) {
      console.info(
        `[MOB] Skipping CSRF bootstrap at ${runtime.baseUrl}/api/v1/auth/csrf because endpoint returned 404.`,
      );
    } else {
      throw error;
    }
  }

  await checkHealth(runtime.client);
};
