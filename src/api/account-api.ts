import type { HttpClient } from '../network/http-client';
import type {
  AccountOrderHistoryPage,
  AccountPosition,
  AccountSummary,
} from '../types/account';

export interface AccountApi {
  fetchAccountPosition: (payload: {
    accountId: string;
    symbol: string;
  }) => Promise<AccountPosition>;
  fetchAccountSummary: (payload: {
    accountId: string;
  }) => Promise<AccountSummary>;
  fetchAccountPositions: (payload: {
    accountId: string;
  }) => Promise<AccountPosition[]>;
  fetchAccountOrderHistory: (payload: {
    accountId: string;
    page: number;
    size: number;
  }) => Promise<AccountOrderHistoryPage>;
}

interface CreateAccountApiInput {
  client: Pick<HttpClient, 'get'>;
}

export const createAccountApi = ({
  client,
}: CreateAccountApiInput): AccountApi => ({
  fetchAccountPosition: async (payload) => {
    const response = await client.get<AccountPosition>(
      `/api/v1/accounts/${payload.accountId}/positions?symbol=${encodeURIComponent(payload.symbol)}`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    return response.body;
  },
  fetchAccountSummary: async (payload) => {
    const response = await client.get<AccountSummary>(
      `/api/v1/accounts/${payload.accountId}/summary`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    return response.body;
  },
  fetchAccountPositions: async (payload) => {
    const response = await client.get<AccountPosition[]>(
      `/api/v1/accounts/${payload.accountId}/positions/list`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    return response.body;
  },
  fetchAccountOrderHistory: async (payload) => {
    const response = await client.get<AccountOrderHistoryPage>(
      `/api/v1/accounts/${payload.accountId}/orders?page=${payload.page}&size=${payload.size}`,
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );

    return response.body;
  },
});
