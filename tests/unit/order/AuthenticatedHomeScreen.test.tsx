import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ReactTestInstance } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

import type { AccountApi } from '@/api/account-api';
import type { NotificationApi, NotificationItem } from '@/api/notification-api';
import type { OrderApi, OrderSessionResponse } from '@/api/order-api';
import {
  createNormalizedHttpError,
  normalizeHttpError,
} from '@/network/errors';
import { __resetPersistedOrderSessionForTests } from '@/order/use-external-order-view-model';
import { __setOrderSessionStorageRuntimeForTests } from '@/order/order-session-storage';
import { AuthenticatedHomeScreen } from '@/screens/app/AuthenticatedHomeScreen';
import type { AccountOrderHistoryPage, AccountPosition } from '@/types/account';
import type { Member } from '@/types/auth';

const memberFixture: Member = {
  memberUuid: 'member-001',
  email: 'demo@fix.com',
  name: 'Demo User',
  role: 'ROLE_USER',
  totpEnrolled: true,
  accountId: '1',
};

const futureIso = (seconds = 3600) =>
  new Date(Date.now() + seconds * 1000).toISOString();

const makeOrderSession = (
  overrides?: Partial<OrderSessionResponse>,
): OrderSessionResponse => ({
  orderSessionId: 'sess-001',
  clOrdId: 'cl-001',
  status: 'AUTHED',
  challengeRequired: false,
  authorizationReason: 'TRUSTED_AUTH_SESSION',
  accountId: 1,
  symbol: '005930',
  side: 'BUY',
  orderType: 'LIMIT',
  qty: 1,
  price: 70100,
  expiresAt: futureIso(),
  ...overrides,
});

const testFileUrl = import.meta.url.startsWith('file:')
  ? import.meta.url
  : `file://${import.meta.url}`;

type SharedProcessingStateCase = {
  name: string;
  status: string;
  title: string;
  body: string;
};

type SharedAuthorizationScenario = {
  scenarioKey: string;
  status: string;
  challengeRequired: boolean;
  authorizationReason: string;
  failureReason?: string;
  clientStep: string;
  nextAction: string;
  title: string;
  body: string;
};

type SharedFinalResultCase = {
  name: string;
  status: string;
  executionResult?: string;
  title: string;
  body: string;
  referenceField?: string;
  referenceLabel?: string;
  referenceVisible?: boolean;
  externalOrderId?: string;
  executionResultLabel?: string;
  executedQty?: number;
  executedQtyLabel?: string;
  executedPrice?: number;
  executedPriceLabel?: string;
  positionQuantityVisible?: boolean;
  positionQuantityLabel?: string;
  updatedPositionQuantity?: number;
  updatedPositionQuantityLabel?: string;
  positionQuantitySource?: string;
  positionQuantitySourceStory?: string;
  failureReason?: string;
  failureReasonLabel?: string;
  leavesQty?: number;
  leavesQtyLabel?: string;
  canceledAt?: string;
  canceledAtLabel?: string;
};

const sharedOrderSessionContractCases = JSON.parse(
  readFileSync(
    fileURLToPath(`${new URL('../../order-session-contract-cases.json', testFileUrl)}`),
    'utf8',
  ),
) as {
  authorizationScenarios: SharedAuthorizationScenario[];
  processingStates: SharedProcessingStateCase[];
  finalResults: SharedFinalResultCase[];
};

const sharedAuthorizationScenarios = sharedOrderSessionContractCases.authorizationScenarios;
const sharedProcessingStateCases = sharedOrderSessionContractCases.processingStates;
const sharedFinalResultCases = sharedOrderSessionContractCases.finalResults;
const authorizationScenario = (scenarioKey: string) => {
  const scenario = sharedAuthorizationScenarios.find(
    (candidate) => candidate.scenarioKey === scenarioKey,
  );

  if (!scenario) {
    throw new Error(`Missing authorization scenario: ${scenarioKey}`);
  }

  return scenario;
};

const positionsFixture: AccountPosition[] = [
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
  },
];

const createHistoryPage = (
  overrides?: Partial<AccountOrderHistoryPage>,
): AccountOrderHistoryPage => ({
  content: [
    {
      symbol: '005930',
      symbolName: '삼성전자',
      side: 'BUY',
      qty: 3,
      unitPrice: 70_100,
      totalAmount: 210_300,
      status: 'FILLED',
      clOrdId: 'cl-001',
      createdAt: '2026-03-11T09:00:00Z',
    },
  ],
  totalElements: 1,
  totalPages: 1,
  number: 0,
  size: 5,
  ...overrides,
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

const createDeferred = <T,>() => {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    reject: rejectPromise,
    resolve: resolvePromise,
  };
};

const mountedRenderers: Array<ReturnType<typeof create>> = [];

const flushMicrotasks = async (cycles = 3) => {
  for (let index = 0; index < cycles; index += 1) {
    await Promise.resolve();
  }
};

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

  onmessage: ((event: { data?: string }) => void) | null = null;

  readonly url: string;

  readonly withCredentials: boolean;

  private readonly listeners = new Map<string, Set<MockEventHandler>>();

  constructor(url: string, init?: EventSourceInit) {
    this.url = url;
    this.withCredentials = Boolean(init?.withCredentials);
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const nextListener = (
      typeof listener === 'function'
        ? listener
        : (event: { data?: string }) => listener.handleEvent(event as unknown as Event)
    ) as MockEventHandler;

    const target = this.listeners.get(type) ?? new Set<MockEventHandler>();
    target.add(nextListener);
    this.listeners.set(type, target);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const target = this.listeners.get(type);
    if (!target) {
      return;
    }

    const deletingListener = (
      typeof listener === 'function'
        ? listener
        : (event: { data?: string }) => listener.handleEvent(event as unknown as Event)
    ) as MockEventHandler;
    target.delete(deletingListener);
  }

  close() {
    // No-op for test double.
  }

  emitOpen() {
    this.onopen?.({});
  }

  emitMessage(data: unknown) {
    this.onmessage?.({
      data: JSON.stringify(data),
    });
  }

  emitRawMessage(data: string) {
    this.onmessage?.({ data });
  }

  emitNotification(data: unknown) {
    const target = this.listeners.get('notification');
    if (!target) {
      return;
    }

    for (const listener of target) {
      listener({
        data: JSON.stringify(data),
      });
    }
  }

  emitError() {
    this.onerror?.({});
  }
}

const createAccountApi = (overrides?: Partial<AccountApi>): AccountApi => ({
  fetchAccountPosition: overrides?.fetchAccountPosition ?? vi.fn().mockResolvedValue(positionsFixture[0]),
  fetchAccountSummary: overrides?.fetchAccountSummary ?? vi.fn().mockResolvedValue({
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
  }),
  fetchAccountPositions: overrides?.fetchAccountPositions ?? vi.fn().mockResolvedValue(positionsFixture),
  fetchAccountOrderHistory:
    overrides?.fetchAccountOrderHistory ?? vi.fn().mockResolvedValue(createHistoryPage()),
});

const createOrderApi = (overrides?: Partial<OrderApi>): OrderApi => ({
  createOrderSession: overrides?.createOrderSession ?? vi.fn().mockResolvedValue({
    orderSessionId: 'sess-001',
    clOrdId: 'cl-001',
    status: 'AUTHED',
    challengeRequired: false,
    authorizationReason: 'TRUSTED_AUTH_SESSION',
    accountId: 1,
    symbol: '005930',
    side: 'BUY',
    orderType: 'LIMIT',
    qty: 1,
    price: 70100,
    expiresAt: futureIso(),
  }),
  extendOrderSession: overrides?.extendOrderSession ?? vi.fn().mockResolvedValue({
    orderSessionId: 'sess-001',
    clOrdId: 'cl-001',
    status: 'AUTHED',
    challengeRequired: false,
    authorizationReason: 'TRUSTED_AUTH_SESSION',
    accountId: 1,
    symbol: '005930',
    side: 'BUY',
    orderType: 'LIMIT',
    qty: 1,
    price: 70100,
    expiresAt: futureIso(),
  }),
  verifyOrderSessionOtp: overrides?.verifyOrderSessionOtp ?? vi.fn(),
  getOrderSession: overrides?.getOrderSession ?? vi.fn(),
  executeOrderSession: overrides?.executeOrderSession ?? vi.fn().mockResolvedValue({
    orderSessionId: 'sess-001',
    clOrdId: 'cl-001',
    status: 'COMPLETED',
    challengeRequired: false,
    authorizationReason: 'TRUSTED_AUTH_SESSION',
    accountId: 1,
    symbol: '005930',
    side: 'BUY',
    orderType: 'LIMIT',
    qty: 1,
    price: 70100,
    executionResult: 'FILLED',
    expiresAt: futureIso(),
  }),
});

const createNotificationApi = (overrides?: Partial<NotificationApi>): NotificationApi => ({
  listNotifications: overrides?.listNotifications ?? vi.fn().mockResolvedValue([]),
  markNotificationRead: overrides?.markNotificationRead
    ?? vi.fn().mockImplementation(async (notificationId: number): Promise<NotificationItem> => ({
      notificationId,
      channel: 'ORDER',
      message: 'read',
      delivered: true,
      read: true,
      readAt: '2026-03-17T00:00:00Z',
    })),
  getStreamUrl: overrides?.getStreamUrl ?? vi.fn().mockReturnValue('http://localhost:8080/api/v1/notifications/stream'),
});

const renderScreen = async (overrides?: {
  accountApi?: AccountApi;
  isRefreshingSession?: boolean;
  member?: Member;
  notificationApi?: NotificationApi;
  orderApi?: OrderApi;
}) => {
  const orderApi = overrides?.orderApi ?? createOrderApi();
  const accountApi = overrides?.accountApi ?? createAccountApi();
  const notificationApi = overrides?.notificationApi ?? createNotificationApi();
  let renderer!: ReturnType<typeof create>;

  await act(async () => {
    renderer = create(
      <AuthenticatedHomeScreen
        accountApi={accountApi}
        member={overrides?.member ?? memberFixture}
          notificationApi={notificationApi}
        orderApi={orderApi}
        welcomeVariant={null}
        sessionErrorMessage={null}
        isRefreshingSession={overrides?.isRefreshingSession ?? false}
        onOpenMfaRecovery={() => {}}
        onRefreshSession={() => {}}
      />,
    );
    await Promise.resolve();
  });
  mountedRenderers.push(renderer);

  return {
    accountApi,
    notificationApi,
    orderApi,
    renderer,
  };
};

const persistOrderSessionForRestore = async (orderSessionId: string) => {
  const firstRender = await renderScreen({
    orderApi: createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue(makeOrderSession({
        orderSessionId,
        clOrdId: `cl-${orderSessionId}`,
        status: 'PENDING_NEW',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        qty: 5,
      })),
    }),
  });

  await act(async () => {
    await findByTestId(firstRender.renderer.root, 'mobile-order-session-create').props.onPress();
    await flushMicrotasks();
  });
  await unmountRenderer(firstRender.renderer);
};

describe('AuthenticatedHomeScreen account dashboard and order boundary', () => {
  const originalEventSource = globalThis.EventSource;

  beforeEach(() => {
    __resetPersistedOrderSessionForTests();
    MockEventSource.reset();
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
  });

  afterEach(async () => {
    globalThis.EventSource = originalEventSource;
    vi.useRealTimers();

    while (mountedRenderers.length > 0) {
      const renderer = mountedRenderers.pop();
      if (renderer) {
        await unmountRenderer(renderer);
      }
    }
  });

  it('renders the dashboard summary, owned symbols, and masked account after loading', async () => {
    const accountApi = createAccountApi();

    const { renderer } = await renderScreen({ accountApi });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-masked-account'))).toBe(
      '***-***1',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-balance'))).toBe(
      '₩100,000,000',
    );
    expect(findAllByTestId(renderer.root, 'mobile-symbol-005930')).toHaveLength(1);
    expect(findAllByTestId(renderer.root, 'mobile-symbol-000660')).toHaveLength(1);
    expect(accountApi.fetchAccountPositions).toHaveBeenCalledWith({
      accountId: '1',
    });
    expect(accountApi.fetchAccountSummary).toHaveBeenCalledWith({
      accountId: '1',
    });
  });

  it('switches between backend-owned symbols without extra position requests', async () => {
    const accountApi = createAccountApi();

    const { renderer } = await renderScreen({ accountApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-symbol-000660').props.onPress();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-balance'))).toBe(
      '₩98,500,000',
    );
    expect(accountApi.fetchAccountPositions).toHaveBeenCalledTimes(1);
    expect(accountApi.fetchAccountPosition).not.toHaveBeenCalled();
  });

  it('shows the empty history state when the server returns no records', async () => {
    const accountApi = createAccountApi({
      fetchAccountOrderHistory: vi.fn().mockResolvedValue(
        createHistoryPage({
          content: [],
          totalElements: 0,
        }),
      ),
    });

    const { renderer } = await renderScreen({ accountApi });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-history-empty'))).toBe(
      '아직 주문 내역이 없습니다.',
    );
  });

  it('renders clOrdId in each history card', async () => {
    const accountApi = createAccountApi();

    const { renderer } = await renderScreen({ accountApi });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-history-row-cl-001'))).toContain(
      '주문 ID cl-001',
    );
  });

  it('shows unavailable dashboard and history states when no linked account exists', async () => {
    const { renderer } = await renderScreen({
      member: {
        ...memberFixture,
        accountId: undefined,
      },
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-unavailable'))).toContain(
      '연결된 계좌가 없어 계좌 요약을 불러올 수 없습니다.',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-history-unavailable'))).toContain(
      '연결된 계좌가 없어 주문 내역을 조회할 수 없습니다.',
    );
    expect(findAllByTestId(renderer.root, 'mobile-history-empty')).toHaveLength(0);
  });

  it('keeps the balance summary visible for cash-only accounts with no owned positions', async () => {
    const accountApi = createAccountApi({
      fetchAccountPositions: vi.fn().mockResolvedValue([]),
      fetchAccountSummary: vi.fn().mockResolvedValue({
        accountId: 1,
        memberId: 1,
        symbol: '',
        quantity: 0,
        availableQuantity: 0,
        availableQty: 0,
        balance: 75_000_000,
        availableBalance: 75_000_000,
        currency: 'KRW',
        asOf: '2026-03-11T09:00:00Z',
      }),
    });

    const { renderer } = await renderScreen({ accountApi });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-dashboard-balance'))).toBe(
      '₩75,000,000',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-symbol-empty'))).toBe(
      '아직 보유 중인 종목이 없습니다.',
    );
    expect(findAllByTestId(renderer.root, 'mobile-dashboard-empty')).toHaveLength(0);
  });

  it('shows standardized retry guidance when history loading fails', async () => {
    const accountApi = createAccountApi({
      fetchAccountOrderHistory: vi.fn().mockRejectedValue(
        createNormalizedHttpError('history failed'),
      ),
    });

    const { renderer } = await renderScreen({ accountApi });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-history-error'))).toContain(
      'history failed',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-history-error'))).toContain(
      '잠시 후 다시 시도해 주세요. 문제가 계속되면 고객센터에 문의해 주세요.',
    );
  });

  it('keeps the pull-to-refresh spinner active until both dashboard requests finish', async () => {
    const refreshPositions = createDeferred<AccountPosition[]>();
    const refreshHistory = createDeferred<AccountOrderHistoryPage>();
    const accountApi = createAccountApi({
      fetchAccountPositions: vi.fn()
        .mockResolvedValueOnce(positionsFixture)
        .mockReturnValueOnce(refreshPositions.promise),
      fetchAccountOrderHistory: vi.fn()
        .mockResolvedValueOnce(createHistoryPage())
        .mockReturnValueOnce(refreshHistory.promise),
    });

    const { renderer } = await renderScreen({ accountApi });

    await act(async () => {
      renderer.root.find((node) => String(node.type) === 'ScrollView').props.refreshControl.props.onRefresh();
      await Promise.resolve();
    });

    expect(
      renderer.root.find((node) => String(node.type) === 'ScrollView').props.refreshControl.props.refreshing,
    ).toBe(true);

    await act(async () => {
      refreshHistory.resolve(
        createHistoryPage({
          content: [
            {
              symbol: '000660',
              symbolName: 'SK하이닉스',
              side: 'SELL',
              qty: 2,
              unitPrice: 120_000,
              totalAmount: 240_000,
              status: 'CANCELED',
              clOrdId: 'cl-refresh',
              createdAt: '2026-03-11T10:00:00Z',
            },
          ],
        }),
      );
      await Promise.resolve();
    });

    expect(
      renderer.root.find((node) => String(node.type) === 'ScrollView').props.refreshControl.props.refreshing,
    ).toBe(true);

    await act(async () => {
      refreshPositions.resolve(positionsFixture);
      await Promise.resolve();
    });

    expect(
      renderer.root.find((node) => String(node.type) === 'ScrollView').props.refreshControl.props.refreshing,
    ).toBe(false);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-history-row-cl-refresh'))).toContain(
      'cl-refresh',
    );
  });

  it('stores live notification updates in UI state when the module receives stream events', async () => {
    const notificationApi = createNotificationApi({
      listNotifications: vi.fn().mockResolvedValue([]),
    });
    const { renderer } = await renderScreen({ notificationApi });

    await act(async () => {
      await flushMicrotasks();
    });

    const stream = MockEventSource.instances[0];
    expect(stream).toBeDefined();
    expect(notificationApi.getStreamUrl).toHaveBeenCalled();

    await act(async () => {
      stream.emitOpen();
      stream.emitNotification({
        notificationId: 401,
        channel: 'ORDER',
        message: '주문이 체결되었습니다.',
        delivered: true,
        read: false,
        readAt: null,
      });
      await flushMicrotasks();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-notification-item-401'))).toContain(
      '주문이 체결되었습니다.',
    );
    expect(findAllByTestId(renderer.root, 'mobile-notification-mark-read-401')).toHaveLength(1);
  });

  it('ignores heartbeat payload and still accepts standard SSE message payload', async () => {
    const notificationApi = createNotificationApi({
      listNotifications: vi.fn().mockResolvedValue([]),
    });
    const { renderer } = await renderScreen({ notificationApi });

    await act(async () => {
      await flushMicrotasks();
    });

    const stream = MockEventSource.instances[0];
    await act(async () => {
      stream.emitOpen();
      stream.emitRawMessage('ok');
      stream.emitMessage({
        notificationId: 404,
        channel: 'ORDER',
        message: 'message-channel event',
        delivered: true,
        read: false,
        readAt: null,
      });
      await flushMicrotasks();
    });

    expect(findAllByTestId(renderer.root, 'mobile-notification-empty')).toHaveLength(0);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-notification-item-404'))).toContain(
      'message-channel event',
    );
  });

  it('synchronizes missed notifications after stream reconnection', async () => {
    vi.useFakeTimers();
    const notificationApi = createNotificationApi({
      listNotifications: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([
          {
            notificationId: 402,
            channel: 'ORDER',
            message: '재연결 후 누락 알림 동기화',
            delivered: true,
            read: false,
            readAt: null,
          },
        ]),
    });
    const { renderer } = await renderScreen({ notificationApi });

    const firstStream = MockEventSource.instances[0];
    await act(async () => {
      firstStream.emitOpen();
      firstStream.emitError();
      vi.advanceTimersByTime(3_000);
      await flushMicrotasks();
    });

    const reconnectedStream = MockEventSource.instances[1];
    expect(reconnectedStream).toBeDefined();

    await act(async () => {
      reconnectedStream.emitOpen();
      await flushMicrotasks();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-notification-item-402'))).toContain(
      '재연결 후 누락 알림 동기화',
    );
    expect(notificationApi.listNotifications).toHaveBeenCalledTimes(2);
  });

  it('reflects mark-as-read state in app after backend read API succeeds', async () => {
    const notificationApi = createNotificationApi({
      listNotifications: vi.fn().mockResolvedValue([
        {
          notificationId: 403,
          channel: 'ORDER',
          message: '읽음 처리 대상',
          delivered: true,
          read: false,
          readAt: null,
        },
      ]),
      markNotificationRead: vi.fn().mockResolvedValue({
        notificationId: 403,
        channel: 'ORDER',
        message: '읽음 처리 대상',
        delivered: true,
        read: true,
        readAt: '2026-03-17T00:00:00Z',
      }),
    });
    const { renderer } = await renderScreen({ notificationApi });

    await act(async () => {
      await flushMicrotasks();
    });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-notification-mark-read-403').props.onPress();
      await flushMicrotasks();
    });

    expect(notificationApi.markNotificationRead).toHaveBeenCalledWith(403);
    expect(findAllByTestId(renderer.root, 'mobile-notification-mark-read-403')).toHaveLength(0);
    expect(findAllByTestId(renderer.root, 'mobile-notification-read-403')).toHaveLength(1);
  });

  it('does not drop newer notifications when mark-read API fails and rollback executes', async () => {
    const markReadDeferred = createDeferred<NotificationItem>();
    const notificationApi = createNotificationApi({
      listNotifications: vi.fn().mockResolvedValue([
        {
          notificationId: 405,
          channel: 'ORDER',
          message: 'rollback target',
          delivered: true,
          read: false,
          readAt: null,
        },
      ]),
      markNotificationRead: vi.fn().mockReturnValue(markReadDeferred.promise),
    });
    const { renderer } = await renderScreen({ notificationApi });

    await act(async () => {
      await flushMicrotasks();
    });

    const stream = MockEventSource.instances[0];
    await act(async () => {
      stream.emitOpen();
      await findByTestId(renderer.root, 'mobile-notification-mark-read-405').props.onPress();
      stream.emitNotification({
        notificationId: 406,
        channel: 'ORDER',
        message: 'concurrent arrival',
        delivered: true,
        read: false,
        readAt: null,
      });
      markReadDeferred.reject(new Error('read failed'));
      await flushMicrotasks();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-notification-item-406'))).toContain(
      'concurrent arrival',
    );
    expect(findAllByTestId(renderer.root, 'mobile-notification-mark-read-405')).toHaveLength(1);
  });

  it('shows retry guidance when repeated disconnects exceed retry threshold', async () => {
    vi.useFakeTimers();
    const notificationApi = createNotificationApi({
      listNotifications: vi.fn().mockResolvedValue([]),
    });
    const { renderer } = await renderScreen({ notificationApi });

    const stream0 = MockEventSource.instances[0];
    await act(async () => {
      stream0.emitOpen();
      stream0.emitError();
      vi.advanceTimersByTime(3_000);
      await flushMicrotasks();
    });

    const stream1 = MockEventSource.instances[1];
    await act(async () => {
      stream1.emitError();
      vi.advanceTimersByTime(6_000);
      await flushMicrotasks();
    });

    const stream2 = MockEventSource.instances[2];
    await act(async () => {
      stream2.emitError();
      vi.advanceTimersByTime(12_000);
      await flushMicrotasks();
    });

    const stream3 = MockEventSource.instances[3];
    await act(async () => {
      stream3.emitError();
      await flushMicrotasks();
    });

    expect(findAllByTestId(renderer.root, 'mobile-notification-retry-guidance')).toHaveLength(1);
  });

  it('gates the order boundary when the authenticated member has no linked order account', async () => {
    const { renderer } = await renderScreen({
      member: {
        ...memberFixture,
        accountId: undefined,
      },
    });

    expect(findAllByTestId(renderer.root, 'mobile-external-order-unavailable')).toHaveLength(1);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-create')).toHaveLength(0);
  });

  it('shows circuit-breaker retry guidance after execute returns a service-unavailable external failure', async () => {
    const createOrderSession = vi.fn().mockResolvedValue({
      orderSessionId: 'sess-fep-001',
      clOrdId: 'cl-fep-001',
      status: 'AUTHED',
      challengeRequired: false,
      authorizationReason: 'TRUSTED_AUTH_SESSION',
      accountId: 1,
      symbol: '005930',
      side: 'BUY',
      orderType: 'LIMIT',
      qty: 1,
      price: 70100,
      expiresAt: futureIso(),
    });
    const executeOrderSession = vi.fn().mockRejectedValue(
      createNormalizedHttpError(
        '거래소 연결이 일시적으로 불안정합니다. 주문이 접수되지 않았을 수 있습니다.',
        {
          code: 'FEP-001',
          operatorCode: 'CIRCUIT_OPEN',
          retryAfterSeconds: 10,
          traceId: 'trace-fep-001',
        },
      ),
    );
    const getOrderSession = vi.fn().mockResolvedValue({
      orderSessionId: 'sess-fep-001',
      clOrdId: 'cl-fep-001',
      status: 'AUTHED',
      challengeRequired: false,
      authorizationReason: 'TRUSTED_AUTH_SESSION',
      accountId: 1,
      symbol: '005930',
      side: 'BUY',
      orderType: 'LIMIT',
      qty: 1,
      price: 70100,
      expiresAt: futureIso(),
    });
    const orderApi = createOrderApi({
      createOrderSession,
      executeOrderSession,
      getOrderSession,
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await Promise.resolve();
    });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-execute').props.onPress();
      await Promise.resolve();
    });

    expect(executeOrderSession).toHaveBeenCalledWith('sess-fep-001');
    expect(getOrderSession).toHaveBeenCalledWith('sess-fep-001');
    expect(
      getTextContent(findByTestId(renderer.root, 'external-order-error-title')),
    ).toBe('주문 서비스를 잠시 사용할 수 없습니다');
    expect(
      getTextContent(findByTestId(renderer.root, 'external-order-error-message')),
    ).toBe('거래소 연결이 일시적으로 불안정합니다. 주문이 접수되지 않았을 수 있습니다.');
    expect(
      getTextContent(findByTestId(renderer.root, 'external-order-error-next-step')),
    ).toBe('약 10초 후 다시 주문해 주세요.');
    expect(
      getTextContent(findByTestId(renderer.root, 'external-order-error-support-reference')),
    ).toBe('문의 코드: trace-fep-001');

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-reset').props.onPress();
      await Promise.resolve();
    });

    expect(findAllByTestId(renderer.root, 'external-order-error-card')).toHaveLength(0);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-create')).toHaveLength(1);
  });

  it('surfaces a header-derived support reference after execute returns an external envelope without traceId', async () => {
    const createOrderSession = vi.fn().mockResolvedValue({
      orderSessionId: 'sess-fep-header-001',
      clOrdId: 'cl-fep-header-001',
      status: 'AUTHED',
      challengeRequired: false,
      authorizationReason: 'TRUSTED_AUTH_SESSION',
      accountId: 1,
      symbol: '005930',
      side: 'BUY',
      orderType: 'LIMIT',
      qty: 1,
      price: 70100,
      expiresAt: futureIso(),
    });
    const executeOrderSession = vi.fn().mockRejectedValue(
      normalizeHttpError({
        status: 422,
        data: {
          success: false,
          data: null,
          error: {
            code: 'FEP-001',
            message: '주문 서비스를 잠시 사용할 수 없습니다',
            detail: '거래소 연결이 일시적으로 불안정합니다. 주문이 접수되지 않았을 수 있습니다.',
            operatorCode: 'CIRCUIT_OPEN',
            retryAfterSeconds: 10,
            timestamp: '2026-03-09T00:00:00Z',
          },
        },
        headers: new Headers({
          'Retry-After': '10',
          'X-Correlation-Id': 'trace-fep-header-001',
        }),
      }),
    );
    const getOrderSession = vi.fn().mockResolvedValue({
      orderSessionId: 'sess-fep-header-001',
      clOrdId: 'cl-fep-header-001',
      status: 'AUTHED',
      challengeRequired: false,
      authorizationReason: 'TRUSTED_AUTH_SESSION',
      accountId: 1,
      symbol: '005930',
      side: 'BUY',
      orderType: 'LIMIT',
      qty: 1,
      price: 70100,
      expiresAt: futureIso(),
    });
    const orderApi = createOrderApi({
      createOrderSession,
      executeOrderSession,
      getOrderSession,
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await Promise.resolve();
    });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-execute').props.onPress();
      await Promise.resolve();
    });

    expect(executeOrderSession).toHaveBeenCalledWith('sess-fep-header-001');
    expect(getOrderSession).toHaveBeenCalledWith('sess-fep-header-001');
    expect(
      getTextContent(findByTestId(renderer.root, 'external-order-error-title')),
    ).toBe('주문 서비스를 잠시 사용할 수 없습니다');
    expect(
      getTextContent(findByTestId(renderer.root, 'external-order-error-support-reference')),
    ).toBe('문의 코드: trace-fep-header-001');
  });

  it('clears execute-time external timeout guidance when refresh resolves to a final result', async () => {
    const createOrderSession = vi.fn().mockResolvedValue({
      orderSessionId: 'sess-001',
      clOrdId: 'cl-001',
      status: 'AUTHED',
      challengeRequired: false,
      authorizationReason: 'TRUSTED_AUTH_SESSION',
      accountId: 1,
      symbol: '005930',
      side: 'BUY',
      orderType: 'LIMIT',
      qty: 1,
      price: 70100,
      expiresAt: futureIso(),
    });
    const executeOrderSession = vi.fn().mockRejectedValue(
      createNormalizedHttpError(
        '주문이 아직 확정되지 않았습니다. 체결 완료로 간주하지 말고 알림이나 주문 상태를 확인해 주세요.',
        {
          code: 'FEP-002',
          operatorCode: 'TIMEOUT',
          traceId: 'trace-fep-002',
        },
      ),
    );
    const getOrderSession = vi.fn().mockResolvedValue({
      orderSessionId: 'sess-001',
      clOrdId: 'cl-001',
      status: 'COMPLETED',
      challengeRequired: false,
      authorizationReason: 'TRUSTED_AUTH_SESSION',
      accountId: 1,
      symbol: '005930',
      side: 'BUY',
      orderType: 'LIMIT',
      qty: 1,
      price: 70100,
      executionResult: 'FILLED',
      expiresAt: futureIso(),
    });
    const orderApi = createOrderApi({
      createOrderSession,
      executeOrderSession,
      getOrderSession,
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await Promise.resolve();
    });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-execute').props.onPress();
      await Promise.resolve();
    });

    expect(createOrderSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        quantity: 1,
        price: 70_100,
      }),
    );
    expect(executeOrderSession).toHaveBeenCalledWith('sess-001');
    expect(getOrderSession).toHaveBeenCalledWith('sess-001');
    expect(findAllByTestId(renderer.root, 'mobile-order-session-result')).toHaveLength(1);
    expect(findAllByTestId(renderer.root, 'external-order-error-card')).toHaveLength(0);
  });

  it('shows contextual Step A validation errors before creating a session', async () => {
    const createOrderSession = vi.fn();
    const orderApi = createOrderApi({
      createOrderSession,
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      findByTestId(renderer.root, 'mobile-order-input-symbol').props.onChangeText('12');
      await Promise.resolve();
    });

    await act(async () => {
      findByTestId(renderer.root, 'mobile-order-input-qty').props.onChangeText('0');
      await Promise.resolve();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-input-symbol-error'))).toBe(
      '종목코드는 숫자 6자리여야 합니다.',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-input-qty-error'))).toBe(
      '수량은 1 이상의 정수여야 합니다.',
    );
    expect(findByTestId(renderer.root, 'mobile-order-session-create').props.disabled).toBe(true);
    expect(createOrderSession).not.toHaveBeenCalled();
  });

  it('advances to the authorization guidance branch when the created session requires challenge', async () => {
    const scenario = authorizationScenario('challenge-required-step-up');
    const createOrderSession = vi.fn().mockResolvedValue({
      orderSessionId: 'sess-step-b',
      clOrdId: 'cl-step-b',
      status: scenario.status,
      challengeRequired: scenario.challengeRequired,
      authorizationReason: scenario.authorizationReason,
      accountId: 1,
      symbol: '005930',
      side: 'BUY',
      orderType: 'LIMIT',
      qty: 1,
      price: 70100,
      expiresAt: futureIso(),
    });
    const orderApi = createOrderApi({
      createOrderSession,
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await Promise.resolve();
    });

    expect(findAllByTestId(renderer.root, 'mobile-order-session-otp-input')).toHaveLength(1);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-authorization'))).toContain(
      scenario.body,
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-execute')).toHaveLength(0);
  });

  it('advances to the canonical auto-authorized confirmation branch without OTP input', async () => {
    const scenario = authorizationScenario('auto-authorized-confirm');
    const orderApi = createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-step-c',
        clOrdId: 'cl-step-c',
        status: scenario.status,
        challengeRequired: scenario.challengeRequired,
        authorizationReason: scenario.authorizationReason,
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 70100,
        expiresAt: futureIso(),
      }),
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await Promise.resolve();
    });

    expect(findAllByTestId(renderer.root, 'mobile-order-session-execute')).toHaveLength(1);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-authorization'))).toContain(
      scenario.body,
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-otp-input')).toHaveLength(0);
  });

  it('maps replayed OTP verification into deterministic guidance', async () => {
    const orderApi = createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-step-b',
        clOrdId: 'cl-step-b',
        status: 'PENDING_NEW',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 70100,
        expiresAt: futureIso(),
      }),
      verifyOrderSessionOtp: vi.fn().mockRejectedValue(
        createNormalizedHttpError('otp code already used in current window', {
          code: 'AUTH-011',
          status: 401,
        }),
      ),
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await flushMicrotasks();
    });

    await act(async () => {
      findByTestId(renderer.root, 'mobile-order-session-otp-input').props.onChangeText('123456');
      await flushMicrotasks();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error'))).toContain(
      '이미 사용한 OTP 코드입니다. 새 코드가 표시되면 다시 입력해 주세요.',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error-category'))).toBe(
      '내부',
    );
  });

  it('maps throttled OTP verification into retry guidance', async () => {
    const orderApi = createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-step-b',
        clOrdId: 'cl-step-b',
        status: 'PENDING_NEW',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 70100,
        expiresAt: futureIso(),
      }),
      verifyOrderSessionOtp: vi.fn().mockRejectedValue(
        createNormalizedHttpError('rate limit exceeded', {
          code: 'RATE_001',
          status: 429,
        }),
      ),
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await flushMicrotasks();
    });

    await act(async () => {
      findByTestId(renderer.root, 'mobile-order-session-otp-input').props.onChangeText('123456');
      await flushMicrotasks();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error'))).toContain(
      'OTP를 너무 빠르게 연속 제출했습니다. 잠시 후 다시 시도해 주세요.',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error-category'))).toBe(
      '내부',
    );
  });

  it('maps canonicalized OTP mismatch errors into remaining-attempts guidance', async () => {
    const orderApi = createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-step-b',
        clOrdId: 'cl-step-b',
        status: 'PENDING_NEW',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 70100,
        expiresAt: futureIso(),
      }),
      verifyOrderSessionOtp: vi.fn().mockRejectedValue(
        createNormalizedHttpError('otp mismatch', {
          code: 'CHANNEL_002',
          remainingAttempts: 2,
          status: 401,
        }),
      ),
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await flushMicrotasks();
    });

    await act(async () => {
      findByTestId(renderer.root, 'mobile-order-session-otp-input').props.onChangeText('123456');
      await flushMicrotasks();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error'))).toContain(
      'OTP 코드가 일치하지 않습니다. 남은 시도 2회',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error-category'))).toBe(
      '내부',
    );
  });

  it('shows the 60-second warning bar and extends the order session', async () => {
    const extendOrderSession = vi.fn().mockResolvedValue({
      orderSessionId: 'sess-warning',
      clOrdId: 'cl-warning',
      status: 'PENDING_NEW',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
      accountId: 1,
      symbol: '005930',
      side: 'BUY',
      orderType: 'LIMIT',
      qty: 1,
      price: 70100,
      expiresAt: futureIso(),
    });
    const orderApi = createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-warning',
        clOrdId: 'cl-warning',
        status: 'PENDING_NEW',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 70100,
        expiresAt: futureIso(45),
      }),
      extendOrderSession,
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await Promise.resolve();
    });

    expect(findAllByTestId(renderer.root, 'mobile-order-session-warning')).toHaveLength(1);

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-extend').props.onPress();
      await Promise.resolve();
    });

    expect(extendOrderSession).toHaveBeenCalledWith('sess-warning');
  });

  it('does not treat an active session with null expiry metadata as already expired', async () => {
    const orderApi = createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-null-expiry',
        clOrdId: 'cl-null-expiry',
        status: 'AUTHED',
        challengeRequired: false,
        authorizationReason: 'TRUSTED_AUTH_SESSION',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 70100,
        expiresAt: null,
      }),
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await Promise.resolve();
    });

    expect(findAllByTestId(renderer.root, 'mobile-order-session-execute')).toHaveLength(1);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-warning')).toHaveLength(0);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-expired-modal')).toHaveLength(0);
  });

  it('shows the expired-session modal and restarts the draft when the session has expired', async () => {
    const scenario = authorizationScenario('expired-session-reset');
    const orderApi = createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-expired',
        clOrdId: 'cl-expired',
        status: 'AUTHED',
        challengeRequired: false,
        authorizationReason: 'TRUSTED_AUTH_SESSION',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 70100,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await Promise.resolve();
    });

    expect(findAllByTestId(renderer.root, 'mobile-order-session-expired-modal')).toHaveLength(1);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-expired-modal'))).toContain(
      scenario.title,
    );

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-expired-restart').props.onPress();
      await Promise.resolve();
    });

    expect(findAllByTestId(renderer.root, 'mobile-order-session-expired-modal')).toHaveLength(0);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-create')).toHaveLength(1);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error'))).toBe(
      `주문 세션이 만료되었습니다. ${scenario.body}`,
    );
  });

  it('shows a blocking expired-session modal when Step B verify detects a stale session', async () => {
    const scenario = authorizationScenario('expired-session-reset');
    const orderApi = createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-expired-verify',
        clOrdId: 'cl-expired-verify',
        status: 'PENDING_NEW',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 70100,
        expiresAt: futureIso(),
      }),
      verifyOrderSessionOtp: vi.fn().mockRejectedValue(
        createNormalizedHttpError('Order session not found.', {
          code: 'ORD-008',
          status: 404,
        }),
      ),
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await flushMicrotasks();
    });

    await act(async () => {
      findByTestId(renderer.root, 'mobile-order-session-otp-input').props.onChangeText('123456');
      await flushMicrotasks();
    });

    expect(findAllByTestId(renderer.root, 'mobile-order-session-expired-modal')).toHaveLength(1);

    await act(async () => {
      findByTestId(renderer.root, 'mobile-order-session-expired-restart').props.onPress();
      await Promise.resolve();
    });

    expect(findAllByTestId(renderer.root, 'mobile-order-session-expired-modal')).toHaveLength(0);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error'))).toBe(
      `주문 세션이 만료되었습니다. ${scenario.body}`,
    );
  });

  it('renders canonical OTP exhaustion restart guidance when a failed session is restored', async () => {
    const scenario = authorizationScenario('failed-session-reset');

    await persistOrderSessionForRestore('sess-failed-restore');

    const orderApi = createOrderApi({
      getOrderSession: vi.fn().mockResolvedValue(makeOrderSession({
        orderSessionId: 'sess-failed-restore',
        clOrdId: 'cl-failed-restore',
        status: scenario.status,
        challengeRequired: scenario.challengeRequired,
        authorizationReason: scenario.authorizationReason,
        failureReason: scenario.failureReason,
        expiresAt: undefined,
      })),
    });
    const { renderer } = await renderScreen({ orderApi });

    expect(findAllByTestId(renderer.root, 'mobile-order-session-result')).toHaveLength(1);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-result-title'))).toBe(
      scenario.title,
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-result'))).toContain(
      scenario.body,
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-reset')).toHaveLength(1);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-otp-input')).toHaveLength(0);
  });

  it('maps server-side Step A rejects back to quantity guidance', async () => {
    const createOrderSession = vi.fn().mockRejectedValue(
      createNormalizedHttpError('가용 수량을 다시 확인해 주세요.', {
        code: 'ORD-005',
        status: 422,
      }),
    );
    const orderApi = createOrderApi({
      createOrderSession,
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-input-qty-error'))).toBe(
      '가용 수량을 다시 확인해 주세요.',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-feedback'))).toContain(
      '보유 수량 또는 일일 매도 가능 한도를 확인한 뒤 수량을 조정해 주세요.',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error-category'))).toBe(
      '검증',
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-error')).toHaveLength(0);
  });

  it('prefers machine-readable insufficient-position semantics for quantity guidance', async () => {
    const createOrderSession = vi.fn().mockRejectedValue(
      createNormalizedHttpError('insufficient position quantity', {
        code: 'ORD-003',
        status: 422,
        userMessageKey: 'error.order.insufficient_position',
        operatorCode: 'INSUFFICIENT_POSITION',
      }),
    );
    const orderApi = createOrderApi({
      createOrderSession,
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-input-qty-error'))).toBe(
      '보유 수량을 다시 확인해 주세요.',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-feedback'))).toContain(
      '보유 수량을 확인한 뒤 수량을 조정해 주세요.',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error-category'))).toBe(
      '검증',
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-error')).toHaveLength(0);
  });

  it('prefers machine-readable daily-sell-limit semantics for quantity guidance', async () => {
    const createOrderSession = vi.fn().mockRejectedValue(
      createNormalizedHttpError('Daily sell limit exceeded', {
        code: 'ORD-005',
        status: 422,
        userMessageKey: 'error.order.daily_sell_limit_exceeded',
        operatorCode: 'DAILY_SELL_LIMIT_EXCEEDED',
      }),
    );
    const orderApi = createOrderApi({
      createOrderSession,
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-input-qty-error'))).toBe(
      '일일 매도 가능 한도를 초과했습니다.',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-feedback'))).toContain(
      '일일 매도 가능 한도를 확인한 뒤 수량을 조정해 주세요.',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error-category'))).toBe(
      '검증',
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-error')).toHaveLength(0);
  });

  it('shows account-level guidance for insufficient cash without pinning the quantity field', async () => {
    const createOrderSession = vi.fn().mockRejectedValue(
      createNormalizedHttpError('available cash is insufficient', {
        code: 'ORD-006',
        status: 422,
      }),
    );
    const orderApi = createOrderApi({
      createOrderSession,
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error'))).toBe(
      'available cash is insufficient',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-feedback'))).toContain(
      '매수 가능 금액을 확인하거나 수량을 조정한 뒤 다시 시도해 주세요.',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error-category'))).toBe(
      '검증',
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-input-qty-error')).toHaveLength(0);
  });

  it('does not classify uncoded create failures from message text alone', async () => {
    const orderApi = createOrderApi({
      createOrderSession: vi.fn().mockRejectedValue(
        createNormalizedHttpError('available cash is insufficient', {
          status: 422,
        }),
      ),
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error'))).toBe(
      'available cash is insufficient',
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-error-category')).toHaveLength(0);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-feedback')).toHaveLength(0);
    expect(findAllByTestId(renderer.root, 'mobile-order-input-qty-error')).toHaveLength(0);
  });

  it('returns from Step B to Step A without discarding the created session context', async () => {
    const createOrderSession = vi.fn().mockResolvedValue({
      orderSessionId: 'sess-step-b',
      clOrdId: 'cl-step-b',
      status: 'PENDING_NEW',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
      accountId: 1,
      symbol: '005930',
      side: 'BUY',
      orderType: 'LIMIT',
      qty: 1,
      price: 70100,
      expiresAt: futureIso(),
    });
    const orderApi = createOrderApi({
      createOrderSession,
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await Promise.resolve();
    });

    await act(async () => {
      findByTestId(renderer.root, 'mobile-order-session-back').props.onPress();
      await Promise.resolve();
    });

    expect(findAllByTestId(renderer.root, 'mobile-order-session-otp-input')).toHaveLength(0);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-summary'))).toContain(
      '상태 PENDING_NEW',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-feedback'))).toContain(
      authorizationScenario('challenge-required-step-up').body,
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-create')).toHaveLength(1);
  });

  it('ignores stale OTP verification success after returning from Step B to Step A', async () => {
    const verifyDeferred = createDeferred<Awaited<ReturnType<OrderApi['verifyOrderSessionOtp']>>>();
    const orderApi = createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-step-b',
        clOrdId: 'cl-step-b',
        status: 'PENDING_NEW',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 70100,
        expiresAt: futureIso(),
      }),
      verifyOrderSessionOtp: vi.fn().mockReturnValue(verifyDeferred.promise),
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await Promise.resolve();
    });

    await act(async () => {
      findByTestId(renderer.root, 'mobile-order-session-otp-input').props.onChangeText('123456');
      await Promise.resolve();
    });

    await act(async () => {
      findByTestId(renderer.root, 'mobile-order-session-back').props.onPress();
      await Promise.resolve();
    });

    await act(async () => {
      verifyDeferred.resolve({
        orderSessionId: 'sess-step-b',
        clOrdId: 'cl-step-b',
        status: 'AUTHED',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 70100,
        expiresAt: futureIso(),
      });
      await Promise.resolve();
    });

    expect(findAllByTestId(renderer.root, 'mobile-order-session-otp-input')).toHaveLength(0);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-execute')).toHaveLength(0);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-create')).toHaveLength(1);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-summary'))).toContain(
      '상태 PENDING_NEW',
    );
  });

  it('restores the saved order session when the screen mounts again', async () => {
    const initialOrderApi = createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-restore-001',
        clOrdId: 'cl-restore-001',
        status: 'PENDING_NEW',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 5,
        price: 70100,
        expiresAt: futureIso(),
      }),
    });
    const firstRender = await renderScreen({ orderApi: initialOrderApi });

    await act(async () => {
      await findByTestId(firstRender.renderer.root, 'mobile-order-session-create').props.onPress();
      await Promise.resolve();
    });
    await act(async () => {
      firstRender.renderer.unmount();
      await Promise.resolve();
    });

    const getOrderSession = vi.fn().mockResolvedValue({
      orderSessionId: 'sess-restore-001',
      clOrdId: 'cl-restore-001',
      status: 'PENDING_NEW',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
      accountId: 1,
      symbol: '005930',
      side: 'BUY',
      orderType: 'LIMIT',
      qty: 5,
      price: 70100,
      expiresAt: futureIso(),
    });
    const restoredOrderApi = createOrderApi({
      getOrderSession,
    });

    const { renderer } = await renderScreen({ orderApi: restoredOrderApi });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getOrderSession).toHaveBeenCalledWith('sess-restore-001');
    expect(findAllByTestId(renderer.root, 'mobile-order-session-otp-input')).toHaveLength(1);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-selected-summary'))).toContain(
      '005930 · 삼성전자 · 5주',
    );
  });

  it('restores an AUTHED order session into Step C after remount', async () => {
    await persistOrderSessionForRestore('sess-restore-authed');

    const getOrderSession = vi.fn().mockResolvedValue(makeOrderSession({
      orderSessionId: 'sess-restore-authed',
      clOrdId: 'cl-sess-restore-authed',
      status: 'AUTHED',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
      qty: 5,
    }));
    const { renderer } = await renderScreen({
      orderApi: createOrderApi({
        getOrderSession,
      }),
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(getOrderSession).toHaveBeenCalledWith('sess-restore-authed');
    expect(findAllByTestId(renderer.root, 'mobile-order-session-execute')).toHaveLength(1);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-otp-input')).toHaveLength(0);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-summary'))).toContain(
      '상태 AUTHED',
    );

    await unmountRenderer(renderer);
  });

  it('restores a REQUERYING order session into processing guidance after remount', async () => {
    await persistOrderSessionForRestore('sess-restore-requery');

    const restoredSession = makeOrderSession({
      orderSessionId: 'sess-restore-requery',
      clOrdId: 'cl-sess-restore-requery',
      status: 'REQUERYING',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
      qty: 5,
    });
    const pollDeferred = createDeferred<OrderSessionResponse>();
    const getOrderSession = vi.fn()
      .mockResolvedValueOnce(restoredSession)
      .mockImplementation(() => pollDeferred.promise);
    const { renderer } = await renderScreen({
      orderApi: createOrderApi({
        getOrderSession,
      }),
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(getOrderSession).toHaveBeenCalledWith('sess-restore-requery');
    expect(findAllByTestId(renderer.root, 'mobile-order-session-processing')).toHaveLength(1);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-processing-title'))).toContain(
      '다시 확인',
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-feedback')).toHaveLength(0);

    await unmountRenderer(renderer);
  });

  it('restores an ESCALATED order session into manual-review guidance after remount', async () => {
    await persistOrderSessionForRestore('sess-restore-escalated');

    const restoredSession = makeOrderSession({
      orderSessionId: 'sess-restore-escalated',
      clOrdId: 'cl-sess-restore-escalated',
      status: 'ESCALATED',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
      qty: 5,
      failureReason: 'ESCALATED_MANUAL_REVIEW',
    });
    const pollDeferred = createDeferred<OrderSessionResponse>();
    const getOrderSession = vi.fn()
      .mockResolvedValueOnce(restoredSession)
      .mockImplementation(() => pollDeferred.promise);
    const { renderer } = await renderScreen({
      orderApi: createOrderApi({
        getOrderSession,
      }),
    });

    await act(async () => {
      await flushMicrotasks();
    });

    expect(getOrderSession).toHaveBeenCalledWith('sess-restore-escalated');
    expect(findAllByTestId(renderer.root, 'mobile-order-session-manual-review')).toHaveLength(1);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-manual-review'))).toContain(
      '수동 확인',
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-feedback')).toHaveLength(0);

    await unmountRenderer(renderer);
  });

  it('ignores a stale restore result after the user edits the draft first', async () => {
    const secureStoreRead = createDeferred<string | null>();
    __setOrderSessionStorageRuntimeForTests({
      isReactNativeRuntime: () => true,
      loadSecureStore: vi.fn().mockResolvedValue({
        get: vi.fn().mockReturnValue(secureStoreRead.promise),
        remove: vi.fn().mockResolvedValue(undefined),
        set: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const getOrderSession = vi.fn().mockResolvedValue({
      orderSessionId: 'sess-stale-restore',
      clOrdId: 'cl-stale-restore',
      status: 'PENDING_NEW',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
      accountId: 1,
      symbol: '005930',
      side: 'BUY',
      orderType: 'LIMIT',
      qty: 5,
      price: 70100,
      expiresAt: futureIso(),
    });

    const { renderer } = await renderScreen({
      orderApi: createOrderApi({
        getOrderSession,
      }),
    });

    await act(async () => {
      findByTestId(renderer.root, 'mobile-order-input-symbol').props.onChangeText('000660');
      await Promise.resolve();
    });

    await act(async () => {
      secureStoreRead.resolve('sess-stale-restore');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getOrderSession).not.toHaveBeenCalled();
    expect(findByTestId(renderer.root, 'mobile-order-input-symbol').props.value).toBe('000660');
    expect(findAllByTestId(renderer.root, 'mobile-order-session-otp-input')).toHaveLength(0);
  });

  it('shows deterministic inline guidance when secure-store bootstrap fails during restore', async () => {
    __setOrderSessionStorageRuntimeForTests({
      isReactNativeRuntime: () => true,
      loadSecureStore: vi.fn().mockRejectedValue(new Error('keychain unavailable')),
    });

    const { renderer } = await renderScreen();
    await act(async () => {
      await Promise.resolve();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error'))).toBe(
      '주문 세션 복원 저장소를 초기화하지 못했습니다. 앱을 다시 시작해 주세요.',
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-otp-input')).toHaveLength(0);
  });

  it('requeries the saved order session after session refresh completes', async () => {
    const initialOrderApi = createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-resume-001',
        clOrdId: 'cl-resume-001',
        status: 'PENDING_NEW',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 5,
        price: 70100,
        expiresAt: futureIso(),
      }),
    });
    const firstRender = await renderScreen({ orderApi: initialOrderApi });

    await act(async () => {
      await findByTestId(firstRender.renderer.root, 'mobile-order-session-create').props.onPress();
    });
    await act(async () => {
      firstRender.renderer.unmount();
      await Promise.resolve();
    });

    const getOrderSession = vi.fn().mockResolvedValue({
      orderSessionId: 'sess-resume-001',
      clOrdId: 'cl-resume-001',
      status: 'PENDING_NEW',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
      accountId: 1,
      symbol: '005930',
      side: 'BUY',
      orderType: 'LIMIT',
      qty: 5,
      price: 70100,
      expiresAt: futureIso(),
    });
    const orderApi = createOrderApi({
      getOrderSession,
    });
    const accountApi = createAccountApi();
    const notificationApi = createNotificationApi();

    const { renderer } = await renderScreen({
      accountApi,
      isRefreshingSession: true,
      notificationApi,
      orderApi,
    });

    expect(getOrderSession).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(
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
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getOrderSession).toHaveBeenCalledWith('sess-resume-001');
  });

  it.each([
    {
      name: 'AUTHED Step C',
      restoredSession: makeOrderSession({
        orderSessionId: 'sess-resume-authed',
        clOrdId: 'cl-sess-resume-authed',
        status: 'AUTHED',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        qty: 5,
      }),
      verify: (root: ReactTestInstance) => {
        expect(findAllByTestId(root, 'mobile-order-session-execute')).toHaveLength(1);
        expect(findAllByTestId(root, 'mobile-order-session-otp-input')).toHaveLength(0);
        expect(getTextContent(findByTestId(root, 'mobile-order-session-summary'))).toContain(
          '상태 AUTHED',
        );
      },
    },
    {
      name: 'EXECUTING processing guidance',
      keepsPolling: true,
      restoredSession: makeOrderSession({
        orderSessionId: 'sess-resume-executing',
        clOrdId: 'cl-sess-resume-executing',
        status: 'EXECUTING',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        qty: 5,
      }),
      verify: (root: ReactTestInstance) => {
        expect(findAllByTestId(root, 'mobile-order-session-processing')).toHaveLength(1);
        expect(
          getTextContent(findByTestId(root, 'mobile-order-session-processing-title')),
        ).toContain(
          sharedProcessingStateCases.find((candidate) => candidate.status === 'EXECUTING')?.title
            ?? '주문을 거래소에 전송했어요',
        );
        expect(getTextContent(findByTestId(root, 'mobile-order-session-processing'))).toContain(
          sharedProcessingStateCases.find((candidate) => candidate.status === 'EXECUTING')?.body
            ?? '체결 결과가 아직 확정되지 않았습니다. 잠시 후 상태가 자동으로 갱신됩니다.',
        );
      },
    },
    {
      name: 'REQUERYING processing guidance',
      keepsPolling: true,
      restoredSession: makeOrderSession({
        orderSessionId: 'sess-resume-requery',
        clOrdId: 'cl-sess-resume-requery',
        status: 'REQUERYING',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        qty: 5,
      }),
      verify: (root: ReactTestInstance) => {
        expect(findAllByTestId(root, 'mobile-order-session-processing')).toHaveLength(1);
        expect(getTextContent(findByTestId(root, 'mobile-order-session-processing-title'))).toContain(
          sharedProcessingStateCases.find((candidate) => candidate.status === 'REQUERYING')?.title
            ?? '주문 체결 결과를 다시 확인하고 있어요',
        );
        expect(getTextContent(findByTestId(root, 'mobile-order-session-processing'))).toContain(
          sharedProcessingStateCases.find((candidate) => candidate.status === 'REQUERYING')?.body
            ?? '체결 결과를 재조회하는 중입니다. 완료로 간주하지 말고 상태가 바뀔 때까지 기다려 주세요.',
        );
      },
    },
    {
      name: 'ESCALATED manual review',
      keepsPolling: true,
      restoredSession: makeOrderSession({
        orderSessionId: 'sess-resume-escalated',
        clOrdId: 'cl-sess-resume-escalated',
        status: 'ESCALATED',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        qty: 5,
        failureReason: 'ESCALATED_MANUAL_REVIEW',
      }),
      verify: (root: ReactTestInstance) => {
        expect(findAllByTestId(root, 'mobile-order-session-manual-review')).toHaveLength(1);
        const manualReviewText = getTextContent(findByTestId(root, 'mobile-order-session-manual-review'));
        expect(manualReviewText).toContain('처리 중 문제가 발생해 수동 확인이 필요합니다.');
        expect(manualReviewText).toContain('주문 번호를 확인한 뒤 고객센터에 문의해 주세요.');
      },
    },
  ])('restores the saved order session into $name after session refresh completes', async ({
    keepsPolling,
    restoredSession,
    verify,
  }) => {
    await persistOrderSessionForRestore(restoredSession.orderSessionId);

    const pollDeferred = createDeferred<OrderSessionResponse>();
    const getOrderSession = keepsPolling
      ? vi.fn()
        .mockResolvedValueOnce(restoredSession)
        .mockImplementation(() => pollDeferred.promise)
      : vi.fn().mockResolvedValue(restoredSession);
    const orderApi = createOrderApi({
      getOrderSession,
    });
    const accountApi = createAccountApi();
    const notificationApi = createNotificationApi();

    const { renderer } = await renderScreen({
      accountApi,
      isRefreshingSession: true,
      notificationApi,
      orderApi,
    });

    expect(getOrderSession).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(
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
      await Promise.resolve();
    });
    await act(async () => {
      await flushMicrotasks();
    });

    expect(getOrderSession).toHaveBeenCalledWith(restoredSession.orderSessionId);
    verify(renderer.root);
  });

  it('transitions a resumed EXECUTING order session into a final result after polling', async () => {
    await persistOrderSessionForRestore('sess-resume-transition');

    const filledResult = sharedFinalResultCases.find(
      (candidate) => candidate.executionResult === 'FILLED',
    );
    const processingDeferred = createDeferred<OrderSessionResponse>();
    vi.useFakeTimers();
    const getOrderSession = vi.fn()
      .mockResolvedValueOnce(makeOrderSession({
        orderSessionId: 'sess-resume-transition',
        clOrdId: 'cl-sess-resume-transition',
        status: 'EXECUTING',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        qty: 5,
        expiresAt: null,
      }))
      .mockImplementationOnce(() => processingDeferred.promise)
      .mockResolvedValueOnce(makeOrderSession({
        orderSessionId: 'sess-resume-transition',
        clOrdId: 'cl-sess-resume-transition',
        status: filledResult?.status ?? 'COMPLETED',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        qty: 5,
        executionResult: filledResult?.executionResult,
        externalOrderId: filledResult?.externalOrderId,
        executedPrice: filledResult?.executedPrice,
        canceledAt: filledResult?.canceledAt,
        expiresAt: null,
      }));
    const orderApi = createOrderApi({
      getOrderSession,
    });
    const accountApi = createAccountApi();
    const notificationApi = createNotificationApi();
    const { renderer } = await renderScreen({
      accountApi,
      isRefreshingSession: true,
      notificationApi,
      orderApi,
    });

    await act(async () => {
      renderer.update(
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

    expect(getOrderSession).toHaveBeenCalledWith('sess-resume-transition');

    processingDeferred.resolve(makeOrderSession({
      orderSessionId: 'sess-resume-transition',
      clOrdId: 'cl-sess-resume-transition',
      status: 'EXECUTING',
      challengeRequired: true,
      authorizationReason: 'ELEVATED_ORDER_RISK',
      qty: 5,
      expiresAt: null,
    }));

    await act(async () => {
      await flushMicrotasks();
    });

    await act(async () => {
      vi.advanceTimersByTime(30_000);
      await flushMicrotasks();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-result-title'))).toContain(
      filledResult?.title ?? '주문이 체결되었습니다',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-result-clordid'))).toContain(
      'cl-sess-resume-transition',
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-result-execution-result'))).toContain(
      filledResult?.executionResultLabel ?? 'FILLED',
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-feedback')).toHaveLength(0);

    vi.useRealTimers();
  });

  it.each(sharedFinalResultCases)('renders final result details for $name', async ({
    executionResult,
    executedQty,
    failureReason,
    leavesQty,
    status,
    title,
    body,
    executionResultLabel,
    externalOrderId,
    executedQtyLabel,
    executedPrice,
    executedPriceLabel,
    positionQuantityVisible,
    positionQuantityLabel,
    updatedPositionQuantity,
    updatedPositionQuantityLabel,
    failureReasonLabel,
    leavesQtyLabel,
    canceledAt,
    canceledAtLabel,
  }) => {
    const accountApi = createAccountApi({
      fetchAccountPosition: vi.fn().mockResolvedValue({
        accountId: 1,
        memberId: 1,
        symbol: '005930',
        quantity: updatedPositionQuantity ?? 120,
        availableQuantity: 20,
        availableQty: 20,
        balance: 100_000_000,
        availableBalance: 100_000_000,
        currency: 'KRW',
        asOf: '2026-03-18T09:00:00Z',
      }),
    });
    const orderApi = createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-final-result',
        clOrdId: 'cl-final-result',
        status: 'AUTHED',
        challengeRequired: false,
        authorizationReason: 'TRUSTED_AUTH_SESSION',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 10,
        price: 70100,
        expiresAt: futureIso(),
      }),
      executeOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-final-result',
        clOrdId: 'cl-final-result',
        challengeRequired: false,
        authorizationReason: 'TRUSTED_AUTH_SESSION',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 10,
        price: 70100,
        expiresAt: null,
        status,
        executionResult,
        executedQty,
        executedPrice,
        externalOrderId,
        failureReason,
        leavesQty,
        canceledAt,
      }),
    });
    const { renderer } = await renderScreen({ accountApi, orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await flushMicrotasks();
    });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-execute').props.onPress();
      await flushMicrotasks();
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-result-title'))).toContain(
      title,
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-result'))).toContain(
      body,
    );
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-result-clordid'))).toContain(
      'cl-final-result',
    );

    if (executionResultLabel) {
      expect(
        getTextContent(findByTestId(renderer.root, 'mobile-order-result-execution-result')),
      ).toContain(executionResultLabel);
    } else {
      expect(findAllByTestId(renderer.root, 'mobile-order-result-execution-result')).toHaveLength(0);
    }

    if (externalOrderId) {
      expect(getTextContent(findByTestId(renderer.root, 'mobile-order-result-external-id'))).toContain(
        externalOrderId,
      );
    } else {
      expect(findAllByTestId(renderer.root, 'mobile-order-result-external-id')).toHaveLength(0);
    }

    if (executedQtyLabel) {
      expect(getTextContent(findByTestId(renderer.root, 'mobile-order-result-executed-qty'))).toContain(
        executedQtyLabel,
      );
    } else {
      expect(findAllByTestId(renderer.root, 'mobile-order-result-executed-qty')).toHaveLength(0);
    }

    if (executedPriceLabel) {
      expect(
        getTextContent(findByTestId(renderer.root, 'mobile-order-result-executed-price')),
      ).toContain(executedPriceLabel);
    } else {
      expect(findAllByTestId(renderer.root, 'mobile-order-result-executed-price')).toHaveLength(0);
    }

    if (leavesQtyLabel) {
      expect(getTextContent(findByTestId(renderer.root, 'mobile-order-result-leaves-qty'))).toContain(
        leavesQtyLabel,
      );
    } else {
      expect(findAllByTestId(renderer.root, 'mobile-order-result-leaves-qty')).toHaveLength(0);
    }

    if (canceledAtLabel) {
      expect(getTextContent(findByTestId(renderer.root, 'mobile-order-result-canceled-at'))).toContain(
        canceledAtLabel,
      );
    } else {
      expect(findAllByTestId(renderer.root, 'mobile-order-result-canceled-at')).toHaveLength(0);
    }

    if (failureReasonLabel) {
      expect(getTextContent(findByTestId(renderer.root, 'mobile-order-result-failure-reason'))).toContain(
        failureReasonLabel,
      );
    } else {
      expect(findAllByTestId(renderer.root, 'mobile-order-result-failure-reason')).toHaveLength(0);
    }

    if (positionQuantityVisible && updatedPositionQuantityLabel) {
      expect(
        getTextContent(findByTestId(renderer.root, 'mobile-order-result-position-qty')),
      ).toContain(`${positionQuantityLabel} · ${updatedPositionQuantityLabel}`);
      expect(accountApi.fetchAccountPosition).toHaveBeenCalledWith({
        accountId: '1',
        symbol: '005930',
      });
    } else {
      expect(findAllByTestId(renderer.root, 'mobile-order-result-position-qty')).toHaveLength(0);
      expect(accountApi.fetchAccountPosition).not.toHaveBeenCalled();
    }
  });

  it('shows a fallback message when refreshed position inquiry fails after a filled result', async () => {
    const accountApi = createAccountApi({
      fetchAccountPosition: vi.fn().mockRejectedValue(new Error('downstream unavailable')),
    });
    const orderApi = createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-final-result',
        clOrdId: 'cl-final-result',
        status: 'AUTHED',
        challengeRequired: false,
        authorizationReason: 'TRUSTED_AUTH_SESSION',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 10,
        price: 70100,
        expiresAt: futureIso(),
      }),
      executeOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-final-result',
        clOrdId: 'cl-final-result',
        challengeRequired: false,
        authorizationReason: 'TRUSTED_AUTH_SESSION',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 10,
        price: 70100,
        expiresAt: null,
        status: 'COMPLETED',
        executionResult: 'FILLED',
      }),
    });
    const { renderer } = await renderScreen({ accountApi, orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await flushMicrotasks();
    });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-execute').props.onPress();
      await flushMicrotasks();
    });

    expect(
      getTextContent(findByTestId(renderer.root, 'mobile-order-result-position-qty-message')),
    ).toContain('현재 보유 수량을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.');
    expect(findAllByTestId(renderer.root, 'mobile-order-result-position-qty')).toHaveLength(0);
  });

  it('locks scenario switching while execute is in flight', async () => {
    const executeDeferred = createDeferred<Awaited<ReturnType<OrderApi['executeOrderSession']>>>();
    const orderApi = createOrderApi({
      createOrderSession: vi.fn().mockResolvedValue({
        orderSessionId: 'sess-auth',
        clOrdId: 'cl-auth',
        status: 'AUTHED',
        challengeRequired: false,
        authorizationReason: 'TRUSTED_AUTH_SESSION',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 70100,
        expiresAt: futureIso(),
      }),
      executeOrderSession: vi.fn().mockReturnValue(executeDeferred.promise),
    });
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-create').props.onPress();
      await flushMicrotasks();
    });

    await act(async () => {
      findByTestId(renderer.root, 'mobile-order-session-execute').props.onPress();
      await flushMicrotasks();
    });

    expect(findByTestId(renderer.root, 'mobile-external-order-preset-krx-buy-5').props.disabled).toBe(true);

    await act(async () => {
      executeDeferred.resolve({
        orderSessionId: 'sess-auth',
        clOrdId: 'cl-auth',
        status: 'COMPLETED',
        challengeRequired: false,
        authorizationReason: 'TRUSTED_AUTH_SESSION',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 1,
        price: 70100,
        executionResult: 'FILLED',
        expiresAt: futureIso(),
      });
      await flushMicrotasks();
    });
  });
});
