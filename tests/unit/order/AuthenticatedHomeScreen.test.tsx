import type { ReactTestInstance } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

import type { OrderApi } from '@/api/order-api';
import { createNormalizedHttpError } from '@/network/errors';
import { AuthenticatedHomeScreen } from '@/screens/app/AuthenticatedHomeScreen';
import type { Member } from '@/types/auth';

const memberFixture: Member = {
  memberUuid: 'member-001',
  email: 'demo@fix.com',
  name: 'Demo User',
  role: 'ROLE_USER',
  totpEnrolled: true,
  accountId: '1',
};

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

const renderScreen = (overrides?: {
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
  let renderer!: ReturnType<typeof create>;

  act(() => {
    renderer = create(
      <AuthenticatedHomeScreen
        member={overrides?.member ?? memberFixture}
        orderApi={orderApi}
        welcomeVariant={null}
        sessionErrorMessage={null}
        isRefreshingSession={false}
        onRefreshSession={() => {}}
      />,
    );
  });

  return {
    orderApi,
    renderer,
  };
};

describe('AuthenticatedHomeScreen order boundary', () => {
  it('gates the order boundary when the authenticated member has no linked order account', () => {
    const { renderer } = renderScreen({
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
    const { renderer } = renderScreen({ orderApi });

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
