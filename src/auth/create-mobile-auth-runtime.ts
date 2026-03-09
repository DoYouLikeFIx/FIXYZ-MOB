import { createAuthApi } from '../api/auth-api';
import { createMobileNetworkRuntime } from '../network/create-mobile-network-runtime';

export const createMobileAuthRuntime = () => {
  const runtime = createMobileNetworkRuntime();

  return {
    ...runtime,
    authApi: createAuthApi({
      client: runtime.client,
      csrfManager: runtime.csrfManager,
    }),
  };
};
