const hoisted = vi.hoisted(() => ({
  createMobileNetworkRuntimeMock: vi.fn(),
  createMobileAuthServiceMock: vi.fn(),
  shouldEnforceStrictCsrfBootstrapMock: vi.fn(),
}));

vi.mock('@/network/create-mobile-network-runtime', () => ({
  createMobileNetworkRuntime: hoisted.createMobileNetworkRuntimeMock,
}));

vi.mock('@/auth/mobile-auth-service', () => ({
  createMobileAuthService: hoisted.createMobileAuthServiceMock,
}));

vi.mock('@/config/runtime-options', async () => {
  const actual = await vi.importActual<typeof import('@/config/runtime-options')>(
    '@/config/runtime-options',
  );

  return {
    ...actual,
    shouldEnforceStrictCsrfBootstrap: hoisted.shouldEnforceStrictCsrfBootstrapMock,
  };
});

import { createMobileAuthRuntime } from '@/auth/create-mobile-auth-runtime';

describe('createMobileAuthRuntime', () => {
  beforeEach(() => {
    hoisted.createMobileNetworkRuntimeMock.mockReset();
    hoisted.createMobileAuthServiceMock.mockReset();
    hoisted.shouldEnforceStrictCsrfBootstrapMock.mockReset();
  });

  it('wires the canonical edge base url into auth bootstrap, account/order APIs, and notification streaming', async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        statusCode: 200,
        body: {},
        headers: new Headers(),
      }),
      post: vi.fn().mockResolvedValue({
        statusCode: 200,
        body: {},
        headers: new Headers(),
      }),
      request: vi.fn().mockResolvedValue({
        statusCode: 200,
        body: {},
        headers: new Headers(),
      }),
    };
    const csrfManager = {
      onAppColdStart: vi.fn(),
      onForegroundResume: vi.fn(),
      injectHeader: vi.fn(),
      forceRefresh: vi.fn(),
    };
    const runtimeFixture = {
      target: 'ios-simulator' as const,
      baseUrl: 'https://edge.fix.example',
      bootstrapClient: client,
      client,
      cookiePolicy: {
        domain: 'edge.fix.example',
        sameSite: 'None' as const,
        secure: true,
      },
      csrfManager,
    };
    const authService = {
      bootstrap: vi.fn(),
    };

    hoisted.createMobileNetworkRuntimeMock.mockReturnValue(runtimeFixture);
    hoisted.createMobileAuthServiceMock.mockReturnValue(authService);
    hoisted.shouldEnforceStrictCsrfBootstrapMock.mockReturnValue(true);

    const runtime = createMobileAuthRuntime();
    await runtime.orderApi.createOrderSession({
      accountId: 42,
      clOrdId: 'edge-order-1',
      symbol: '005930',
      side: 'BUY',
      quantity: 1,
      price: 70_500,
    });
    await runtime.accountApi.fetchAccountSummary({
      accountId: '42',
    });

    expect(hoisted.createMobileNetworkRuntimeMock).toHaveBeenCalledTimes(1);
    expect(hoisted.createMobileAuthServiceMock).toHaveBeenCalledWith({
      authApi: runtime.authApi,
      csrfManager,
      appBootstrap: {
        baseUrl: 'https://edge.fix.example',
        client,
        csrfManager,
        strictCsrfBootstrap: true,
      },
    });
    expect(runtime.baseUrl).toBe('https://edge.fix.example');
    expect(runtime.authService).toBe(authService);
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/orders/sessions',
      {
        accountId: 42,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 70_500,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-ClOrdID': 'edge-order-1',
        },
      },
    );
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/accounts/42/summary',
      {
        headers: {
          Accept: 'application/json',
        },
      },
    );
    expect(runtime.notificationApi.getStreamUrl()).toBe(
      'https://edge.fix.example/api/v1/notifications/stream',
    );
  });
});
