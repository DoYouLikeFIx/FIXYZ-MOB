import { createOrderApi } from '@/api/order-api';

describe('order api', () => {
  const client = {
    post: vi.fn(),
  };

  beforeEach(() => {
    client.post.mockReset();
  });

  it('submits orders through /api/v1/orders with form-encoded payload and idempotency header', async () => {
    client.post.mockResolvedValue({
      statusCode: 200,
      body: {
        orderId: 1,
        clOrdId: 'cl-001',
        status: 'RECEIVED',
        idempotent: false,
        orderQuantity: 2,
      },
    });

    const orderApi = createOrderApi({ client });

    await expect(
      orderApi.submitOrder({
        accountId: 1,
        clOrdId: 'cl-001',
        symbol: '005930',
        side: 'BUY',
        quantity: 2,
        price: 71000,
      }),
    ).resolves.toMatchObject({
      status: 'RECEIVED',
      clOrdId: 'cl-001',
    });

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/orders',
      'accountId=1&clOrdId=cl-001&symbol=005930&side=BUY&quantity=2&price=71000',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-ClOrdID': 'cl-001',
        },
      },
    );
  });
});
