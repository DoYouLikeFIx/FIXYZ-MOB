import type { ReactTestInstance } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

import type { AccountApi } from '@/api/account-api';
import type { OrderApi } from '@/api/order-api';
import { createNormalizedHttpError } from '@/network/errors';
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

const renderScreen = async (overrides?: {
  accountApi?: AccountApi;
  member?: Member;
  orderApi?: OrderApi;
}) => {
  const fallbackSubmitOrder = vi.fn().mockResolvedValue({
    orderId: 1,
    clOrdId: 'cl-001',
    status: 'RECEIVED',
    idempotent: false,
    orderQuantity: 1,
  });
  const orderApi = overrides?.orderApi ?? {
    submitOrder: (payload) => fallbackSubmitOrder(payload),
  };
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
        isRefreshingSession={false}
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
    expect(findAllByTestId(renderer.root, 'mobile-external-order-submit')).toHaveLength(0);
  });

  it('renders visible external-order guidance after a failed submit', async () => {
    const submitOrder = vi.fn().mockRejectedValue(
      createNormalizedHttpError(
        '주문이 아직 확정되지 않았습니다. 체결 완료로 간주하지 말고 알림이나 주문 상태를 확인해 주세요.',
        {
          code: 'FEP-002',
          operatorCode: 'TIMEOUT',
          traceId: 'trace-fep-002',
        },
      ),
    );
    const orderApi: OrderApi = {
      submitOrder: (payload) => submitOrder(payload),
    };
    const { renderer } = await renderScreen({ orderApi });

    await act(async () => {
      await findByTestId(renderer.root, 'mobile-external-order-submit').props.onPress();
    });

    expect(submitOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        quantity: 1,
        price: 70_100,
      }),
    );
    expect(
      getTextContent(findByTestId(renderer.root, 'external-order-error-title')),
    ).toBe('주문 결과를 확인하고 있습니다');
    expect(
      getTextContent(findByTestId(renderer.root, 'external-order-error-support-reference')),
    ).toBe('문의 코드: trace-fep-002');
  });
});
