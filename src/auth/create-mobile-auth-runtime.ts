import { createAuthApi } from '../api/auth-api';
import { createOrderApi } from '../api/order-api';
import { createMobileNetworkRuntime } from '../network/create-mobile-network-runtime';

export const createMobileAuthRuntime = () => {
  const runtime = createMobileNetworkRuntime();

  return {
    ...runtime,
    authApi: createAuthApi({
      client: runtime.client,
      csrfManager: runtime.csrfManager,
    }),
    orderApi: createOrderApi({
      client: runtime.client,
    }),
  };
};
