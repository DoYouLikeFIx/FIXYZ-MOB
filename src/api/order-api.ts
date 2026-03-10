import type { HttpClient } from '../network/http-client';
import type { ExternalOrderRequest } from '../order/external-order-recovery';

export interface OrderSubmissionResponse {
  orderId: number;
  clOrdId: string;
  status: string;
  idempotent: boolean;
  orderQuantity: number;
}

export interface OrderApi {
  submitOrder: (payload: ExternalOrderRequest) => Promise<OrderSubmissionResponse>;
}

interface CreateOrderApiInput {
  client: Pick<HttpClient, 'post'>;
}

const createFormBody = (payload: Record<string, string>) =>
  new URLSearchParams(payload).toString();

const FORM_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
};

export const createOrderApi = ({ client }: CreateOrderApiInput): OrderApi => ({
  submitOrder: async (payload) => {
    const response = await client.post<OrderSubmissionResponse>(
      '/api/v1/orders',
      createFormBody({
        accountId: String(payload.accountId),
        clOrdId: payload.clOrdId,
        symbol: payload.symbol,
        side: payload.side,
        quantity: String(payload.quantity),
        price: String(payload.price),
      }),
      {
        headers: {
          ...FORM_HEADERS,
          'X-ClOrdID': payload.clOrdId,
        },
      },
    );

    return response.body;
  },
});
