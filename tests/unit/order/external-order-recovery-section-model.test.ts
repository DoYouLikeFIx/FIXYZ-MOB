import { buildExternalOrderRecoverySectionModel } from '@/components/order/external-order-recovery-section-model';
import { externalOrderPresetOptions } from '@/order/external-order-recovery';

describe('external order recovery section model', () => {
  it('describes Step A before any session has been created', () => {
    const model = buildExternalOrderRecoverySectionModel({
      step: 'A',
      feedbackMessage: null,
      inlineError: null,
      isInteractionLocked: false,
      isCreating: false,
      isExecuting: false,
      isVerifyingOtp: false,
      orderSession: null,
      presentation: null,
      presets: externalOrderPresetOptions,
      selectedPresetId: 'krx-buy-1',
      draftSummary: '005930 · 삼성전자 · 1주',
    });

    expect(model.title).toBe('주문 Step A 준비');
    expect(model.description).toContain('주문 세션을 만들고');
    expect(model.clearAction.disabled).toBe(true);
  });

  it('keeps support reference compatible with the canonical guidance when an external error exists', () => {
    const model = buildExternalOrderRecoverySectionModel({
      step: 'C',
      feedbackMessage: null,
      inlineError: null,
      isInteractionLocked: false,
      isCreating: false,
      isExecuting: false,
      isVerifyingOtp: false,
      orderSession: {
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
        price: 70100,
        expiresAt: '2026-03-13T00:00:00Z',
      },
      presentation: {
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
      },
      presets: externalOrderPresetOptions,
      selectedPresetId: 'krx-buy-2',
      draftSummary: '005930 · 삼성전자 · 2주',
    });

    expect(model.selectedSummary).toBe('005930 · 삼성전자 · 2주');
    expect(model.clearAction.disabled).toBe(false);
    expect(model.orderSummary).toContain('상태 AUTHED');
  });

  it('shows inline feedback for non-external application errors', () => {
    const model = buildExternalOrderRecoverySectionModel({
      step: 'B',
      feedbackMessage: null,
      inlineError: '입력 값을 다시 확인해 주세요.',
      isInteractionLocked: true,
      isCreating: false,
      isExecuting: false,
      isVerifyingOtp: true,
      orderSession: {
        orderSessionId: 'sess-001',
        clOrdId: 'cl-001',
        status: 'PENDING_NEW',
        challengeRequired: true,
        authorizationReason: 'ELEVATED_ORDER_RISK',
        accountId: 1,
        symbol: '005930',
        side: 'BUY',
        orderType: 'LIMIT',
        qty: 5,
        price: 70300,
        expiresAt: '2026-03-13T00:00:00Z',
      },
      presentation: null,
      presets: externalOrderPresetOptions,
      selectedPresetId: 'krx-buy-5',
      draftSummary: '005930 · 삼성전자 · 5주',
    });

    expect(model.inlineError).toBe('입력 값을 다시 확인해 주세요.');
    expect(model.otpInput.helperText).toBe('OTP 검증 중...');
    expect(model.clearAction.disabled).toBe(false);
  });
});
