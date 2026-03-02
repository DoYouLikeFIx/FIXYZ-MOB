import { DEFAULT_HEALTH_TIMEOUT_MS } from '../config/environment';
import type { HttpClientResponse } from './types';

export { DEFAULT_HEALTH_TIMEOUT_MS } from '../config/environment';

export interface HealthPayload {
  status: string;
  [key: string]: unknown;
}

export interface HealthClient {
  get(
    path: string,
    options: {
      timeoutMs: number;
    },
  ): Promise<HttpClientResponse<HealthPayload>>;
}

export const checkHealth = async (
  client: HealthClient,
): Promise<HttpClientResponse<HealthPayload>> => {
  const response = await client.get('/actuator/health', {
    timeoutMs: DEFAULT_HEALTH_TIMEOUT_MS,
  });

  if (response.statusCode !== 200) {
    throw new Error(`MOB-HEALTH-001: Expected HTTP 200, received ${response.statusCode}`);
  }

  return response;
};
