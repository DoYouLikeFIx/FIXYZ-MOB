import { createAuthApi } from '../api/auth-api';
import { createAccountApi } from '../api/account-api';
import { createOrderApi } from '../api/order-api';
import { shouldEnforceStrictCsrfBootstrap } from '../config/runtime-options';
import { createMobileNetworkRuntime } from '../network/create-mobile-network-runtime';
import { createMobileAuthService } from './mobile-auth-service';

export const createMobileAuthRuntime = () => {
  const runtime = createMobileNetworkRuntime();
  const authApi = createAuthApi({
    client: runtime.client,
    csrfManager: runtime.csrfManager,
  });

  return {
    ...runtime,
    authApi,
    authService: createMobileAuthService({
      authApi,
      csrfManager: runtime.csrfManager,
      appBootstrap: {
        baseUrl: runtime.baseUrl,
        client: runtime.client,
        csrfManager: runtime.csrfManager,
        strictCsrfBootstrap: shouldEnforceStrictCsrfBootstrap(),
      },
    }),
    accountApi: createAccountApi({
      client: runtime.client,
    }),
    orderApi: createOrderApi({
      client: runtime.client,
    }),
  };
};
