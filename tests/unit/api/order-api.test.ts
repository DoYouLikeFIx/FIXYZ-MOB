import { createOrderApi } from '@/api/order-api';

describe('order api', () => {
  const client = {
    get: vi.fn(),
    post: vi.fn(),
  };

  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
  });

  it('creates order sessions through /api/v1/orders/sessions with json payload and idempotency header', async () => {
    client.post.mockResolvedValue({
      statusCode: 201,
      body: {
        orderSessionId: 'sess-001',
        clOrdId: 'cl-001',
        status: 'AUTHED',
        challengeRequired: false,
        authorizationReason: 'RECENT_LOGIN_MFA',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 2,
        price: 71000,
        expiresAt: '2026-03-13T00:00:00Z',
      },
    });

    const orderApi = createOrderApi({ client });

    await expect(
      orderApi.createOrderSession({
        accountId: 1,
        clOrdId: 'cl-001',
        symbol: '005930',
        side: 'BUY',
        quantity: 2,
        price: 71000,
      }),
    ).resolves.toMatchObject({
      orderSessionId: 'sess-001',
      status: 'AUTHED',
    });

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/orders/sessions',
      {
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 2,
        price: 71000,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-ClOrdID': 'cl-001',
        },
      },
    );
  });

  it('verifies OTP through the canonical step-up endpoint', async () => {
    client.post.mockResolvedValue({
      statusCode: 200,
      body: {
        orderSessionId: 'sess-001',
        clOrdId: 'cl-001',
        status: 'AUTHED',
        challengeRequired: false,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 2,
        price: 71000,
        expiresAt: '2026-03-13T00:00:00Z',
      },
    });

    const orderApi = createOrderApi({ client });

    await orderApi.verifyOrderSessionOtp('sess-001', '123456');

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/orders/sessions/sess-001/otp/verify',
      { otpCode: '123456' },
    );
  });

  it('extends an active order session through the canonical extend endpoint', async () => {
    client.post.mockResolvedValue({
      statusCode: 200,
      body: {
        orderSessionId: 'sess-001',
        clOrdId: 'cl-001',
        status: 'AUTHED',
        challengeRequired: false,
        authorizationReason: 'TRUSTED_AUTH_SESSION',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 2,
        price: 71000,
        expiresAt: '2026-03-13T01:00:00Z',
      },
    });

    const orderApi = createOrderApi({ client });

    await orderApi.extendOrderSession('sess-001');

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/orders/sessions/sess-001/extend',
      {},
    );
  });

  it('executes an authorized order session through the canonical execute path', async () => {
    client.post.mockResolvedValue({
      statusCode: 200,
      body: {
        orderSessionId: 'sess-001',
        clOrdId: 'cl-001',
        status: 'COMPLETED',
        challengeRequired: false,
        authorizationReason: 'RECENT_LOGIN_MFA',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 2,
        price: 71000,
        executionResult: 'FILLED',
        expiresAt: '2026-03-13T00:00:00Z',
      },
    });

    const orderApi = createOrderApi({ client });

    await orderApi.executeOrderSession('sess-001');

    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/orders/sessions/sess-001/execute',
      {},
    );
  });

  it('loads the current order session by id', async () => {
    client.get.mockResolvedValue({
      statusCode: 200,
      body: {
        orderSessionId: 'sess-restore-001',
        clOrdId: 'cl-restore-001',
        status: 'PENDING_NEW',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 70100,
        expiresAt: '2026-03-13T00:00:00Z',
      },
    });

    const orderApi = createOrderApi({ client });

    await orderApi.getOrderSession('sess-restore-001');

    expect(client.get).toHaveBeenCalledWith('/api/v1/orders/sessions/sess-restore-001');
  });
});
