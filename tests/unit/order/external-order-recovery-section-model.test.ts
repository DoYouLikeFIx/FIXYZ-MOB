import { buildExternalOrderRecoverySectionModel } from '@/components/order/external-order-recovery-section-model';
import { externalOrderPresetOptions } from '@/order/external-order-recovery';

describe('external order recovery section model', () => {
  it('shows the empty state before any external error or feedback exists', () => {
    const model = buildExternalOrderRecoverySectionModel({
      feedbackMessage: null,
      isSubmitting: false,
      presentation: null,
      presets: externalOrderPresetOptions,
      selectedPresetId: 'krx-buy-1',
    });

    expect(model.emptyStateMessage).toContain('아직 대외 오류를 받지 않았습니다');
    expect(model.clearAction.disabled).toBe(true);
  });

  it('keeps support reference compatible with the canonical guidance when an external error exists', () => {
    const model = buildExternalOrderRecoverySectionModel({
      feedbackMessage: null,
      isSubmitting: false,
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
    });

    expect(model.selectedSummary).toBe('005930 · 2주 · 70,100원');
    expect(model.clearAction.disabled).toBe(false);
    expect(model.emptyStateMessage).toBeNull();
  });

  it('shows inline feedback for non-external application errors', () => {
    const model = buildExternalOrderRecoverySectionModel({
      feedbackMessage: '입력 값을 다시 확인해 주세요.',
      isSubmitting: false,
      presentation: null,
      presets: externalOrderPresetOptions,
      selectedPresetId: 'krx-buy-5',
    });

    expect(model.feedbackMessage).toBe('입력 값을 다시 확인해 주세요.');
    expect(model.emptyStateMessage).toBeNull();
    expect(model.clearAction.disabled).toBe(false);
  });
});
