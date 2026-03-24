import type { ReactTestInstance } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

import { createAccountApi } from '@/api/account-api';
import type { NotificationApi, NotificationItem } from '@/api/notification-api';
import { createOrderApi } from '@/api/order-api';
import { InMemoryCookieManager } from '@/network/cookie-manager';
import { CsrfTokenManager } from '@/network/csrf';
import { HttpClient } from '@/network/http-client';
import { __resetPersistedOrderSessionForTests } from '@/order/use-external-order-view-model';
import { AuthenticatedHomeScreen } from '@/screens/app/AuthenticatedHomeScreen';
import type { Member } from '@/types/auth';

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

const memberFixture: Member = {
  memberUuid: 'member-001',
  email: 'demo@fix.com',
  name: 'Demo User',
  role: 'ROLE_USER',
  totpEnrolled: true,
  accountId: '1',
};

const quoteDateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const jsonResponse = (
  status: number,
  body: unknown,
  headers?: Record<string, string>,
) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    ...(headers ?? {}),
  },
});

const successResponse = <T,>(status: number, data: T) =>
  jsonResponse(status, {
    success: true,
    data,
    error: null,
  });

const errorResponse = (
  status: number,
  error: Record<string, unknown>,
  headers?: Record<string, string>,
) =>
  jsonResponse(status, {
    success: false,
    data: null,
    error: {
      timestamp: '2026-03-23T00:00:00.000Z',
      ...error,
    },
  }, headers);

const normalizeHeaders = (headers: HeadersInit | undefined): Record<string, string> => {
  if (!headers) {
    return {};
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  return {
    ...headers,
  };
};

const getPathname = (url: string) => new URL(url).pathname;

const readHeader = (headers: Record<string, string>, name: string) => {
  const normalizedName = name.toLowerCase();
  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === normalizedName,
  );

  return entry?.[1];
};

const createHistoryPage = () => ({
  content: [],
  totalElements: 0,
  totalPages: 0,
  number: 0,
  size: 5,
});

const findAllByTestId = (root: ReactTestInstance, testId: string) =>
  root.findAll((node) => node.props?.testID === testId);

const findByTestId = (root: ReactTestInstance, testId: string) => {
  const matches = findAllByTestId(root, testId);
  if (matches.length === 0) {
    throw new Error(`Unable to find node with testID=${testId}`);
  }

  return matches[0];
};

const getTextContent = (node: ReactTestInstance | string | number | null | undefined): string => {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (!node) {
    return '';
  }

  return node.children.map((child) => getTextContent(child as ReactTestInstance)).join('');
};

const flushMicrotasks = async (cycles = 4) => {
  for (let index = 0; index < cycles; index += 1) {
    await Promise.resolve();
  }
};

const mountedRenderers: Array<ReturnType<typeof create>> = [];

const unmountRenderer = async (renderer: ReturnType<typeof create>) => {
  const index = mountedRenderers.indexOf(renderer);
  if (index >= 0) {
    mountedRenderers.splice(index, 1);
  }

  await act(async () => {
    renderer.unmount();
    await flushMicrotasks();
  });
};

type MockEventHandler = (event: { data?: string }) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  static reset() {
    MockEventSource.instances = [];
  }

  onopen: ((event: unknown) => void) | null = null;

  onerror: ((event: unknown) => void) | null = null;

  onmessage: MockEventHandler | null = null;

  private readonly listeners = new Map<string, Set<MockEventHandler>>();

  constructor(
    public readonly url: string,
    public readonly init?: EventSourceInit,
  ) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const wrapped = listener as MockEventHandler;
    const handlers = this.listeners.get(type) ?? new Set<MockEventHandler>();
    handlers.add(wrapped);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener as MockEventHandler);
  }

  close() {}
}

const createNotificationApiStub = (baseUrl: string): NotificationApi => ({
  listNotifications: vi.fn().mockResolvedValue([]),
  markNotificationRead: vi.fn().mockImplementation(async (notificationId: number): Promise<NotificationItem> => ({
    notificationId,
    channel: 'ORDER',
    message: 'read',
    delivered: true,
    read: true,
    readAt: '2026-03-23T00:00:00.000Z',
  })),
  getStreamUrl: () => `${baseUrl}/api/v1/notifications/stream`,
});

const createHarness = (
  handler: (request: RecordedCall) => Promise<Response> | Response,
) => {
  const baseUrl = 'http://localhost:8080';
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const request: RecordedCall = {
        url: String(input),
        method: (init?.method ?? 'GET').toUpperCase(),
        headers: normalizeHeaders(init?.headers),
        body: typeof init?.body === 'string' ? init.body : undefined,
      };

      calls.push(request);
      return handler(request);
    },
  );
  const cookieManager = new InMemoryCookieManager();
  const bootstrapClient = new HttpClient({
    baseUrl,
    fetchFn: fetchMock as unknown as typeof fetch,
  });
  const csrfManager = new CsrfTokenManager({
    baseUrl,
    cookieManager,
    bootstrapCsrf: async () => {
      const response = await bootstrapClient.get<{ csrfToken?: string; token?: string }>(
        '/api/v1/auth/csrf',
      );
      const token = response.body.csrfToken ?? response.body.token ?? '';
      cookieManager.setCookie(baseUrl, 'XSRF-TOKEN', token);
      return response.body;
    },
  });
  const client = new HttpClient({
    baseUrl,
    fetchFn: fetchMock as unknown as typeof fetch,
    csrfManager,
  });
  const accountApi = createAccountApi({ client });
  const orderApi = createOrderApi({ client });
  const notificationApi = createNotificationApiStub(baseUrl);

  return {
    calls,
    renderScreen: async () => {
      let renderer!: ReturnType<typeof create>;

      await act(async () => {
        renderer = create(
          <AuthenticatedHomeScreen
            accountApi={accountApi}
            member={memberFixture}
            notificationApi={notificationApi}
            orderApi={orderApi}
            welcomeVariant={null}
            sessionErrorMessage={null}
            isRefreshingSession={false}
            onOpenMfaRecovery={() => {}}
            onRefreshSession={() => {}}
          />,
        );
        await flushMicrotasks();
      });

      mountedRenderers.push(renderer);

      return {
        renderer,
      };
    },
  };
};

const notFoundResponse = (request: RecordedCall) =>
  errorResponse(404, {
    code: 'SYS-404',
    message: `Unhandled request: ${request.method} ${getPathname(request.url)}`,
    detail: getPathname(request.url),
  });

describe('mobile order transport-backed screen coverage', () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    __resetPersistedOrderSessionForTests();
    MockEventSource.reset();
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
  });

  afterEach(async () => {
    globalThis.EventSource = originalEventSource;

    while (mountedRenderers.length > 0) {
      const renderer = mountedRenderers.pop();
      if (renderer) {
        await unmountRenderer(renderer);
      }
    }
  });

  it('renders delayed and replay quote freshness from transport-backed account responses', async () => {
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/accounts/1/summary') {
        return successResponse(200, {
          accountId: 1,
          memberId: 1,
          symbol: '',
          quantity: 0,
          availableQuantity: 0,
          availableQty: 0,
          balance: 100_000_000,
          availableBalance: 100_000_000,
          currency: 'KRW',
          asOf: '2026-03-11T09:05:00Z',
        });
      }

      if (
        request.method === 'GET'
        && getPathname(request.url) === '/api/v1/accounts/1/positions/list'
      ) {
        return successResponse(200, [
          {
            accountId: 1,
            memberId: 1,
            symbol: '005930',
            quantity: 120,
            availableQuantity: 20,
            availableQty: 20,
            balance: 100_000_000,
            availableBalance: 100_000_000,
            currency: 'KRW',
            asOf: '2026-03-11T09:10:00Z',
            avgPrice: 68_900,
            marketPrice: 70_100,
            quoteSnapshotId: 'quote-delayed-001',
            quoteAsOf: '2026-03-11T09:09:00Z',
            quoteSourceMode: 'DELAYED',
            unrealizedPnl: 144_000,
            realizedPnlDaily: 12_000,
            valuationStatus: 'FRESH',
            valuationUnavailableReason: null,
          },
          {
            accountId: 1,
            memberId: 1,
            symbol: '000660',
            quantity: 15,
            availableQuantity: 7,
            availableQty: 7,
            balance: 98_500_000,
            availableBalance: 98_500_000,
            currency: 'KRW',
            asOf: '2026-03-11T09:20:00Z',
            avgPrice: 200_000,
            marketPrice: null,
            quoteSnapshotId: 'quote-replay-001',
            quoteAsOf: '2026-03-11T09:19:00Z',
            quoteSourceMode: 'REPLAY',
            unrealizedPnl: null,
            realizedPnlDaily: null,
            valuationStatus: 'STALE',
            valuationUnavailableReason: 'STALE_QUOTE',
          },
        ]);
      }

      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/accounts/1/orders') {
        return successResponse(200, createHistoryPage());
      }

      return notFoundResponse(request);
    });

    const { renderer } = await harness.renderScreen();

    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-market-price'))).toBe(
      '₩70,100',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-avg-price'))).toBe(
      '₩68,900',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-unrealized-pnl'))).toBe(
      '+₩144,000',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-valuation-status'))).toBe(
      '평가 가능',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-quote-source-mode'))).toBe(
      'DELAYED',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-quote-as-of'))).toBe(
      quoteDateFormatter.format(new Date('2026-03-11T09:09:00Z')),
    );

    await act(async () => {
      findByTestId(renderer.root, 'mobile-symbol-000660').props.onPress();
      await flushMicrotasks();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-market-price'))).toBe(
      '확인 불가',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-unrealized-pnl'))).toBe(
      '확인 불가',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-valuation-status'))).toBe(
      '시세 지연',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-valuation-guidance'))).toContain(
      '호가 기준이 오래되어',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-quote-source-mode'))).toBe(
      'REPLAY',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-quote-as-of'))).toBe(
      quoteDateFormatter.format(new Date('2026-03-11T09:19:00Z')),
    );
  });

  it('keeps the user in Step A with stale-quote guidance through the transport-backed create path', async () => {
    const harness = createHarness((request) => {
      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/auth/csrf') {
        return successResponse(200, {
          token: 'csrf-mobile-order-001',
        });
      }

      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/accounts/1/summary') {
        return successResponse(200, {
          accountId: 1,
          memberId: 1,
          symbol: '',
          quantity: 0,
          availableQuantity: 0,
          availableQty: 0,
          balance: 100_000_000,
          availableBalance: 100_000_000,
          currency: 'KRW',
          asOf: '2026-03-11T09:05:00Z',
        });
      }

      if (
        request.method === 'GET'
        && getPathname(request.url) === '/api/v1/accounts/1/positions/list'
      ) {
        return successResponse(200, [
          {
            accountId: 1,
            memberId: 1,
            symbol: '005930',
            quantity: 120,
            availableQuantity: 20,
            availableQty: 20,
            balance: 100_000_000,
            availableBalance: 100_000_000,
            currency: 'KRW',
            asOf: '2026-03-11T09:10:00Z',
            avgPrice: 68_900,
            marketPrice: 70_100,
            quoteSnapshotId: 'quote-live-001',
            quoteAsOf: '2026-03-11T09:09:00Z',
            quoteSourceMode: 'LIVE',
            unrealizedPnl: 144_000,
            realizedPnlDaily: 12_000,
            valuationStatus: 'FRESH',
            valuationUnavailableReason: null,
          },
        ]);
      }

      if (request.method === 'GET' && getPathname(request.url) === '/api/v1/accounts/1/orders') {
        return successResponse(200, createHistoryPage());
      }

      if (request.method === 'POST' && getPathname(request.url) === '/api/v1/orders/sessions') {
        return errorResponse(400, {
          code: 'VALIDATION-003',
          message: '시장가 주문에 사용할 시세가 오래되었습니다.',
          detail: '시장가 주문에 사용한 quote snapshot이 허용 범위를 초과했습니다.',
          operatorCode: 'STALE_QUOTE',
          userMessageKey: 'error.quote.stale',
          details: {
            symbol: '005930',
            quoteSnapshotId: 'qsnap-replay-001',
            quoteSourceMode: 'REPLAY',
            snapshotAgeMs: 65_000,
          },
        });
      }

      return notFoundResponse(request);
    });

    const { renderer } = await harness.renderScreen();

    await act(async () => {
      findByTestId(renderer.root, 'mobile-external-order-preset-krx-market-buy-3').props.onPress();
      await flushMicrotasks();
    });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await flushMicrotasks(6);
    });

    const createCall = harness.calls.find(
      (call) =>
        call.method === 'POST' && getPathname(call.url) === '/api/v1/orders/sessions',
    );

    expect(JSON.parse(createCall?.body ?? '{}')).toMatchObject({
      accountId: 1,
      symbol: '005930',
      orderType: 'MARKET',
      qty: 3,
      price: null,
    });
    expect(readHeader(createCall?.headers ?? {}, 'X-XSRF-TOKEN')).toBe('csrf-mobile-order-001');
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error-category'))).toBe(
      '검증',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-stale-quote-guidance'))).toContain(
      'symbol=005930',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-stale-quote-guidance'))).toContain(
      'quoteSnapshotId=qsnap-replay-001',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-stale-quote-guidance'))).toContain(
      'quoteSourceMode=REPLAY',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-stale-quote-guidance'))).toContain(
      'snapshotAgeMs=65000',
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-feedback')).toHaveLength(0);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-error')).toHaveLength(0);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-otp-input')).toHaveLength(0);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-execute')).toHaveLength(0);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-create')).toHaveLength(1);
  });
});
