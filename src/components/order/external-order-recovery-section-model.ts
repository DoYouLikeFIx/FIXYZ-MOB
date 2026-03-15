import type { OrderFlowStep, OrderSessionResponse } from '../../types/order';
import type {
  ExternalOrderPresetId,
  ExternalOrderPresetOption,
} from '../../order/external-order-recovery';
import type { ExternalOrderErrorPresentation } from '../../order/external-errors';
import { formatKRW, formatQuantity } from '../../utils/formatters';

interface ExternalOrderRecoverySectionModelInput {
  step: OrderFlowStep;
  feedbackMessage: string | null;
  inlineError: string | null;
  isInteractionLocked: boolean;
  isCreating: boolean;
  isVerifyingOtp: boolean;
  isExecuting: boolean;
  presentation: ExternalOrderErrorPresentation | null;
  orderSession: OrderSessionResponse | null;
  presets: readonly ExternalOrderPresetOption[];
  selectedPresetId: ExternalOrderPresetId | null;
  draftSummary: string;
}

const stepTitle = (step: OrderFlowStep) => {
  if (step === 'B') {
    return '주문 Step B OTP 인증';
  }
  if (step === 'C') {
    return '주문 Step C 실행';
  }
  if (step === 'COMPLETE') {
    return '주문 완료';
  }
  return '주문 Step A 준비';
};

const stepDescription = (step: OrderFlowStep) => {
  if (step === 'B') {
    return '세션이 생성되었고 추가 OTP 인증이 필요합니다. 6자리 코드를 입력하면 바로 검증합니다.';
  }
  if (step === 'C') {
    return '주문 세션이 인증되었습니다. 이제 execute로 최종 주문을 보냅니다.';
  }
  if (step === 'COMPLETE') {
    return '주문 세션이 완료 상태입니다. 같은 영역에서 다음 주문을 다시 시작할 수 있습니다.';
  }
  return '주문 세션을 만들고, 필요할 때만 OTP Step B를 거쳐 Step C execute로 이어집니다.';
};

export const buildExternalOrderRecoverySectionModel = ({
  step,
  feedbackMessage,
  inlineError,
  isInteractionLocked,
  isCreating,
  isVerifyingOtp,
  isExecuting,
  presentation,
  orderSession,
  presets,
  selectedPresetId,
  draftSummary,
}: ExternalOrderRecoverySectionModelInput) => {
  return {
    kicker: 'ORDER SESSION',
    title: stepTitle(step),
    description: stepDescription(step),
    feedbackMessage,
    inlineError,
    selectedSummary: draftSummary,
    orderSummary: orderSession
      ? `${orderSession.symbol} · ${formatQuantity(orderSession.qty)}주 · ${
        orderSession.price === null ? '시장가' : formatKRW(orderSession.price)
      } · 상태 ${orderSession.status}`
      : null,
    scenarios: presets.map((preset) => ({
      id: preset.id,
      label: preset.label,
      isDisabled: isInteractionLocked,
      isSelected: preset.id === selectedPresetId,
      testId: `mobile-external-order-preset-${preset.id}`,
    })),
    createAction: {
      label: isCreating ? '주문 세션 생성 중...' : 'Step A 시작',
      disabled: isInteractionLocked,
      testId: 'mobile-order-session-create',
    },
    executeAction: {
      label: isExecuting ? '주문 실행 중...' : '주문 실행',
      disabled: isExecuting || isCreating || isVerifyingOtp,
      testId: 'mobile-order-session-execute',
    },
    resetAction: {
      label: step === 'COMPLETE' ? '새 주문 시작' : '초기화',
      disabled: isCreating || isVerifyingOtp || isExecuting,
      testId: 'mobile-order-session-reset',
    },
    clearAction: {
      label: '안내 지우기',
      disabled: feedbackMessage === null && inlineError === null && presentation === null,
      testId: 'mobile-order-session-clear',
    },
    otpInput: {
      editable: !isVerifyingOtp,
      helperText: isVerifyingOtp ? 'OTP 검증 중...' : 'Step B OTP 6자리',
      testId: 'mobile-order-session-otp-input',
    },
  };
};
