import type { ReactTestInstance } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

import type { AccountApi } from '@/api/account-api';
import type { OrderApi } from '@/api/order-api';
import { createNormalizedHttpError } from '@/network/errors';
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

const renderScreen = async (overrides?: {
  accountApi?: AccountApi;
  isRefreshingSession?: boolean;
  member?: Member;
  orderApi?: OrderApi;
}) => {
  const orderApi = overrides?.orderApi ?? createOrderApi();
  const accountApi = overrides?.accountApi ?? createAccountApi();
  let renderer!: ReturnType<typeof create>;

  await act(async () => {
    renderer = create(
      <AuthenticatedHomeScreen
        accountApi={accountApi}
        member={overrides?.member ?? memberFixture}
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

  return {
    accountApi,
    orderApi,
    renderer,
  };
};

describe('AuthenticatedHomeScreen account dashboard and order boundary', () => {
  beforeEach(() => {
    __resetPersistedOrderSessionForTests();
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

  it('renders visible external-order guidance after execute returns an external failure', async () => {
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
    const orderApi = createOrderApi({
      createOrderSession,
      executeOrderSession,
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
    expect(
      getTextContent(findByTestId(renderer.root, 'external-order-error-title')),
    ).toBe('주문 결과를 확인하고 있습니다');
    expect(
      getTextContent(findByTestId(renderer.root, 'external-order-error-support-reference')),
    ).toBe('문의 코드: trace-fep-002');
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

    expect(findAllByTestId(renderer.root, 'mobile-order-session-otp-input')).toHaveLength(1);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-authorization'))).toContain(
      'OTP 인증이 필요합니다.',
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

  it('shows the expired-session modal and restarts the draft when the session has expired', async () => {
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

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-order-session-expired-restart').props.onPress();
      await Promise.resolve();
    });

    expect(findAllByTestId(renderer.root, 'mobile-order-session-expired-modal')).toHaveLength(0);
    expect(findAllByTestId(renderer.root, 'mobile-order-session-create')).toHaveLength(1);
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-error'))).toBe(
      '주문 세션이 만료되었습니다. 입력한 주문을 확인한 뒤 다시 시작해 주세요.',
    );
  });

  it('maps server-side Step A rejects back to quantity guidance', async () => {
    const createOrderSession = vi.fn().mockRejectedValue(
      createNormalizedHttpError('가용 수량을 다시 확인해 주세요.', {
        code: 'ORD-003',
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
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-feedback'))).toBe(
      '수량을 수정한 뒤 다시 시도해 주세요.',
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-error')).toHaveLength(0);
  });

  it('shows account-level guidance for insufficient cash without pinning the quantity field', async () => {
    const createOrderSession = vi.fn().mockRejectedValue(
      createNormalizedHttpError('available cash is insufficient', {
        code: 'ORD-001',
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
    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-feedback'))).toBe(
      '매수 가능 금액을 확인하거나 수량을 조정한 뒤 다시 시도해 주세요.',
    );
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
      'OTP 인증이 필요합니다.',
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

    const { renderer } = await renderScreen({
      accountApi,
      isRefreshingSession: true,
      orderApi,
    });

    expect(getOrderSession).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(
        <AuthenticatedHomeScreen
          accountApi={accountApi}
          member={memberFixture}
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
      await Promise.resolve();
    });

    await act(async () => {
      findByTestId(renderer.root, 'mobile-order-session-execute').props.onPress();
      await Promise.resolve();
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
      await Promise.resolve();
    });
  });
});
