import type {
  ExternalOrderPresetId,
  ExternalOrderPresetOption,
} from '../../order/external-order-recovery';
import type { ExternalOrderErrorPresentation } from '../../order/external-errors';

interface ExternalOrderRecoverySectionModelInput {
  feedbackMessage: string | null;
  isSubmitting: boolean;
  presentation: ExternalOrderErrorPresentation | null;
  presets: readonly ExternalOrderPresetOption[];
  selectedPresetId: ExternalOrderPresetId;
}

export const buildExternalOrderRecoverySectionModel = ({
  feedbackMessage,
  isSubmitting,
  presentation,
  presets,
  selectedPresetId,
}: ExternalOrderRecoverySectionModelInput) => {
  const selectedPreset =
    presets.find((preset) => preset.id === selectedPresetId) ?? presets[0];

  return {
    kicker: 'ORDER BOUNDARY',
    title: '주문 오류 안내',
    description:
      '실제 /api/v1/orders 응답에서 FEP 오류가 수신되면 재시도, 대기, 문의 안내를 같은 의미로 노출합니다.',
    feedbackMessage,
    emptyStateMessage:
      presentation === null && feedbackMessage === null
        ? '아직 대외 오류를 받지 않았습니다. 주문 요청 뒤 오류가 수신되면 이 영역에 복구 안내가 나타납니다.'
        : null,
    selectedSummary: selectedPreset.summary,
    scenarios: presets.map((preset) => ({
      id: preset.id,
      label: preset.label,
      isSelected: preset.id === selectedPresetId,
      summary: preset.summary,
      testId: `mobile-external-order-preset-${preset.id}`,
    })),
    submitAction: {
      label: isSubmitting ? '주문 요청 전송 중...' : '주문 요청 보내기',
      disabled: isSubmitting,
      testId: 'mobile-external-order-submit',
    },
    clearAction: {
      label: '안내 지우기',
      disabled: (presentation === null && feedbackMessage === null) || isSubmitting,
      testId: 'mobile-external-order-clear',
    },
  };
};
