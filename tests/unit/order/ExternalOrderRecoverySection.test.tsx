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

const futureIso = (seconds = 3600) =>
  new Date(Date.now() + seconds * 1000).toISOString();

describe('ExternalOrderRecoverySection', () => {
  it('renders visible support reference and selected scenario state for an external execute error', () => {
    let renderer!: ReturnType<typeof create>;

    act(() => {
      renderer = create(
        <ExternalOrderRecoverySection
          step="C"
          feedbackMessage={null}
          inlineError={null}
          symbolValue="005930"
          quantityValue="2"
          symbolError={null}
          quantityError={null}
          draftSummary="005930 · 삼성전자 · 2주"
          canSubmit
          isInteractionLocked={false}
          isCreating={false}
          isExecuting={false}
          isExtending={false}
          isRestoring={false}
          isVerifyingOtp={false}
          orderSession={{
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
            price: 70100,
            expiresAt: futureIso(),
          }}
          authorizationReasonMessage="최근 로그인 MFA가 확인되어 추가 인증 없이 바로 주문을 실행할 수 있습니다."
          otpValue=""
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
          onBackToDraft={() => {}}
          onExecute={() => {}}
          onReset={() => {}}
          onRestartExpiredSession={() => {}}
          onSelectPreset={() => {}}
          onSetSymbolValue={() => {}}
          onSetQuantityValue={() => {}}
          onSetOtpValue={() => {}}
          onSubmit={() => {}}
          onExtend={() => {}}
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
      disabled: false,
      selected: true,
    });
  });

  it('renders inline feedback without the external error card for non-external failures', () => {
    let renderer!: ReturnType<typeof create>;

    act(() => {
      renderer = create(
        <ExternalOrderRecoverySection
          step="A"
          feedbackMessage={null}
          inlineError="입력 값을 다시 확인해 주세요."
          symbolValue="005930"
          quantityValue="1"
          symbolError={null}
          quantityError={null}
          draftSummary="005930 · 삼성전자 · 1주"
          canSubmit
          isInteractionLocked={false}
          isCreating={false}
          isExecuting={false}
          isExtending={false}
          isRestoring={false}
          isVerifyingOtp={false}
          orderSession={null}
          authorizationReasonMessage={null}
          otpValue=""
          presentation={null}
          presets={externalOrderPresetOptions}
          selectedPresetId="krx-buy-1"
          onClear={() => {}}
          onBackToDraft={() => {}}
          onExecute={() => {}}
          onReset={() => {}}
          onRestartExpiredSession={() => {}}
          onSelectPreset={() => {}}
          onSetSymbolValue={() => {}}
          onSetQuantityValue={() => {}}
          onSetOtpValue={() => {}}
          onSubmit={() => {}}
          onExtend={() => {}}
        />,
      );
    });

    const feedback = findByTestId(renderer.root, 'mobile-order-session-error');

    expect(getTextContent(feedback)).toContain('입력 값을 다시 확인해 주세요.');
    expect(findAllByTestId(renderer.root, 'external-order-error-card')).toHaveLength(0);
  });

  it('disables scenario chips while interaction is locked', () => {
    let renderer!: ReturnType<typeof create>;

    act(() => {
      renderer = create(
        <ExternalOrderRecoverySection
          step="C"
          feedbackMessage={null}
          inlineError={null}
          symbolValue="005930"
          quantityValue="2"
          symbolError={null}
          quantityError={null}
          draftSummary="005930 · 삼성전자 · 2주"
          canSubmit={false}
          isInteractionLocked
          isCreating={false}
          isExecuting
          isExtending={false}
          isRestoring={false}
          isVerifyingOtp={false}
          orderSession={{
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
            price: 70100,
            expiresAt: futureIso(),
          }}
          authorizationReasonMessage="최근 로그인 MFA가 확인되어 추가 인증 없이 바로 주문을 실행할 수 있습니다."
          otpValue=""
          presentation={null}
          presets={externalOrderPresetOptions}
          selectedPresetId="krx-buy-2"
          onClear={() => {}}
          onBackToDraft={() => {}}
          onExecute={() => {}}
          onReset={() => {}}
          onRestartExpiredSession={() => {}}
          onSelectPreset={() => {}}
          onSetSymbolValue={() => {}}
          onSetQuantityValue={() => {}}
          onSetOtpValue={() => {}}
          onSubmit={() => {}}
          onExtend={() => {}}
        />,
      );
    });

    const selectedPreset = findByTestId(renderer.root, 'mobile-external-order-preset-krx-buy-2');

    expect(selectedPreset.props.disabled).toBe(true);
    expect(selectedPreset.props.accessibilityState).toEqual({
      disabled: true,
      selected: true,
    });
  });

  it('renders the compact expiry warning in Step B when the session is within 60 seconds', () => {
    let renderer!: ReturnType<typeof create>;

    act(() => {
      renderer = create(
        <ExternalOrderRecoverySection
          step="B"
          feedbackMessage={null}
          inlineError={null}
          symbolValue="005930"
          quantityValue="2"
          symbolError={null}
          quantityError={null}
          draftSummary="005930 · 삼성전자 · 2주"
          canSubmit={false}
          isInteractionLocked={false}
          isCreating={false}
          isExecuting={false}
          isExtending={false}
          isRestoring={false}
          isVerifyingOtp={false}
          orderSession={{
            orderSessionId: 'sess-warning',
            clOrdId: 'cl-warning',
            status: 'PENDING_NEW',
            challengeRequired: true,
            authorizationReason: 'ELEVATED_ORDER_RISK',
            accountId: 1,
            symbol: '005930',
            side: 'BUY',
            orderType: 'LIMIT',
            qty: 2,
            price: 70100,
            expiresAt: futureIso(45),
          }}
          authorizationReasonMessage="고위험 주문으로 분류되어 주문 실행 전에 OTP 인증이 필요합니다."
          otpValue=""
          presentation={null}
          presets={externalOrderPresetOptions}
          selectedPresetId="krx-buy-2"
          onClear={() => {}}
          onBackToDraft={() => {}}
          onExecute={() => {}}
          onReset={() => {}}
          onRestartExpiredSession={() => {}}
          onSelectPreset={() => {}}
          onSetSymbolValue={() => {}}
          onSetQuantityValue={() => {}}
          onSetOtpValue={() => {}}
          onSubmit={() => {}}
          onExtend={() => {}}
        />,
      );
    });

    expect(getTextContent(findByTestId(renderer.root, 'mobile-order-session-warning'))).toContain(
      '세션 곧 만료',
    );
    expect(findAllByTestId(renderer.root, 'mobile-order-session-extend')).toHaveLength(1);
  });

  it('renders the expired-session modal when the order session has expired', () => {
    let renderer!: ReturnType<typeof create>;

    act(() => {
      renderer = create(
        <ExternalOrderRecoverySection
          step="C"
          feedbackMessage={null}
          inlineError={null}
          symbolValue="005930"
          quantityValue="2"
          symbolError={null}
          quantityError={null}
          draftSummary="005930 · 삼성전자 · 2주"
          canSubmit={false}
          isInteractionLocked={false}
          isCreating={false}
          isExecuting={false}
          isExtending={false}
          isRestoring={false}
          isVerifyingOtp={false}
          orderSession={{
            orderSessionId: 'sess-expired',
            clOrdId: 'cl-expired',
            status: 'AUTHED',
            challengeRequired: false,
            authorizationReason: 'TRUSTED_AUTH_SESSION',
            accountId: 1,
            symbol: '005930',
            side: 'BUY',
            orderType: 'LIMIT',
            qty: 2,
            price: 70100,
            expiresAt: new Date(Date.now() - 1000).toISOString(),
          }}
          authorizationReasonMessage="현재 신뢰 세션이 유효하여 추가 OTP 없이 바로 주문을 실행할 수 있습니다."
          otpValue=""
          presentation={null}
          presets={externalOrderPresetOptions}
          selectedPresetId="krx-buy-2"
          onClear={() => {}}
          onBackToDraft={() => {}}
          onExecute={() => {}}
          onReset={() => {}}
          onRestartExpiredSession={() => {}}
          onSelectPreset={() => {}}
          onSetSymbolValue={() => {}}
          onSetQuantityValue={() => {}}
          onSetOtpValue={() => {}}
          onSubmit={() => {}}
          onExtend={() => {}}
        />,
      );
    });

    expect(findAllByTestId(renderer.root, 'mobile-order-session-expired-modal')).toHaveLength(1);
  });
});
