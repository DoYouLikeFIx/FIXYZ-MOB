import type { HttpClient } from '../network/http-client';
import type { ExternalOrderRequest } from '../order/external-order-recovery';

export interface OrderSessionResponse {
  orderSessionId: string;
  clOrdId: string;
  status: string;
  challengeRequired: boolean;
  authorizationReason: string;
  accountId: number;
  symbol: string;
  side: string;
  orderType: string;
  qty: number;
  price: number | null;
  executionResult?: string | null;
  executedQty?: number | null;
  leavesQty?: number | null;
  executedPrice?: number | null;
  externalOrderId?: string | null;
  failureReason?: string | null;
  executedAt?: string | null;
  canceledAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  expiresAt: string;
  remainingSeconds?: number | null;
}

export interface OrderApi {
  createOrderSession: (payload: ExternalOrderRequest) => Promise<OrderSessionResponse>;
  verifyOrderSessionOtp: (
    orderSessionId: string,
    otpCode: string,
  ) => Promise<OrderSessionResponse>;
  extendOrderSession: (orderSessionId: string) => Promise<OrderSessionResponse>;
  getOrderSession: (orderSessionId: string) => Promise<OrderSessionResponse>;
  executeOrderSession: (orderSessionId: string) => Promise<OrderSessionResponse>;
}

interface CreateOrderApiInput {
  client: Pick<HttpClient, 'get' | 'post'>;
}

const createOrderSessionBody = (payload: ExternalOrderRequest) => ({
  accountId: payload.accountId,
  symbol: payload.symbol,
  side: payload.side,
  orderType: 'LIMIT',
  qty: payload.quantity,
  price: payload.price,
});

export const createOrderApi = ({ client }: CreateOrderApiInput): OrderApi => ({
  createOrderSession: async (payload) => {
    const response = await client.post<OrderSessionResponse>(
      '/api/v1/orders/sessions',
      createOrderSessionBody(payload),
      {
        headers: {
          'Content-Type': 'application/json',
          'X-ClOrdID': payload.clOrdId,
        },
      },
    );

    return response.body;
  },
  verifyOrderSessionOtp: async (orderSessionId, otpCode) => {
    const response = await client.post<OrderSessionResponse>(
      `/api/v1/orders/sessions/${orderSessionId}/otp/verify`,
      { otpCode },
    );

    return response.body;
  },
  extendOrderSession: async (orderSessionId) => {
    const response = await client.post<OrderSessionResponse>(
      `/api/v1/orders/sessions/${orderSessionId}/extend`,
      {},
    );

    return response.body;
  },
  getOrderSession: async (orderSessionId) => {
    const response = await client.get<OrderSessionResponse>(
      `/api/v1/orders/sessions/${orderSessionId}`,
    );

    return response.body;
  },
  executeOrderSession: async (orderSessionId) => {
    const response = await client.post<OrderSessionResponse>(
      `/api/v1/orders/sessions/${orderSessionId}/execute`,
      {},
    );

    return response.body;
  },
});
