import type { ReactTestInstance } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

import { ExternalOrderRecoverySection } from '@/components/order/ExternalOrderRecoverySection';
import { externalOrderPresetOptions } from '@/order/external-order-recovery';

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

describe('ExternalOrderRecoverySection', () => {
  it('renders visible support reference and selected scenario state for an external error', () => {
    let renderer!: ReturnType<typeof create>;

    act(() => {
      renderer = create(
        <ExternalOrderRecoverySection
          feedbackMessage={null}
          isSubmitting={false}
          presentation={{
            code: 'FEP-002',
            semantic: 'pending-confirmation',
            recoveryAction: 'wait-for-update',
            severity: 'info',
            title: '주문 결과를 확인하고 있습니다',
            message:
              '주문이 아직 확정되지 않았습니다. 체결 완료로 간주하지 말고 알림이나 주문 상태를 확인해 주세요.',
            nextStep: '잠시 후 알림이 없으면 주문 내역을 다시 조회해 주세요.',
            traceId: 'trace-fep-002',
            supportReference: '문의 코드: trace-fep-002',
          }}
          presets={externalOrderPresetOptions}
          selectedPresetId="krx-buy-2"
          onClear={() => {}}
          onSelectPreset={() => {}}
          onSubmit={() => {}}
        />,
      );
    });

    const supportReference = findByTestId(
      renderer.root,
      'external-order-error-support-reference',
    );
    const selectedPreset = findByTestId(renderer.root, 'mobile-external-order-preset-krx-buy-2');

    expect(getTextContent(supportReference)).toBe('문의 코드: trace-fep-002');
    expect(selectedPreset.props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('renders inline feedback without the external error card for non-external failures', () => {
    let renderer!: ReturnType<typeof create>;

    act(() => {
      renderer = create(
        <ExternalOrderRecoverySection
          feedbackMessage="입력 값을 다시 확인해 주세요."
          isSubmitting={false}
          presentation={null}
          presets={externalOrderPresetOptions}
          selectedPresetId="krx-buy-1"
          onClear={() => {}}
          onSelectPreset={() => {}}
          onSubmit={() => {}}
        />,
      );
    });

    const feedback = findByTestId(renderer.root, 'mobile-external-order-feedback');

    expect(getTextContent(feedback)).toContain('입력 값을 다시 확인해 주세요.');
    expect(findAllByTestId(renderer.root, 'external-order-error-card')).toHaveLength(0);
  });
});
