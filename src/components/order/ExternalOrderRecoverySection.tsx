import { Pressable, Text, TextInput, View } from 'react-native';

import { useExpiryCountdown } from '../../auth/use-expiry-countdown';
import { palette } from '../auth/auth-styles';
import type {
  ExternalOrderPresetId,
  ExternalOrderPresetOption,
} from '../../order/external-order-recovery';
import type { ExternalOrderErrorPresentation } from '../../order/external-errors';
import type { OrderFlowStep, OrderSessionResponse } from '../../types/order';
import { formatKRW, formatQuantity } from '../../utils/formatters';
import { ExternalOrderErrorCard } from './ExternalOrderErrorCard';
import { buildExternalOrderRecoverySectionModel } from './external-order-recovery-section-model';
import {
  resolveOrderFinalResultContent,
  resolveOrderProcessingContent,
} from '../../order/order-session-guidance';

interface ExternalOrderRecoverySectionProps {
  step: OrderFlowStep;
  feedbackMessage: string | null;
  inlineError: string | null;
  symbolValue: string;
  quantityValue: string;
  symbolError: string | null;
  quantityError: string | null;
  draftSummary: string;
  canSubmit: boolean;
  isInteractionLocked: boolean;
  isCreating: boolean;
  isVerifyingOtp: boolean;
  isExecuting: boolean;
  isExtending: boolean;
  isRestoring: boolean;
  presentation: ExternalOrderErrorPresentation | null;
  orderSession: OrderSessionResponse | null;
  hasDetectedSessionExpiry?: boolean;
  authorizationReasonMessage: string | null;
  otpValue: string;
  presets: readonly ExternalOrderPresetOption[];
  selectedPresetId: ExternalOrderPresetId | null;
  onClear: () => void;
  onReset: () => void;
  onRestartExpiredSession: () => void;
  onBackToDraft: () => void;
  onSelectPreset: (presetId: ExternalOrderPresetId) => void;
  onSetSymbolValue: (value: string) => void;
  onSetQuantityValue: (value: string) => void;
  onSetOtpValue: (value: string) => void;
  onSubmit: () => void;
  onExecute: () => void;
  onExtend: () => void;
}

const EMPTY_EXPIRY = '1970-01-01T00:00:00Z';

const isProcessingStatus = (status?: OrderSessionResponse['status']) =>
  status === 'EXECUTING' || status === 'REQUERYING';

const isManualReviewStatus = (status?: OrderSessionResponse['status']) => status === 'ESCALATED';

const isFinalResultStatus = (status?: OrderSessionResponse['status']) =>
  status === 'COMPLETED'
  || status === 'FAILED'
  || status === 'CANCELED';

export const ExternalOrderRecoverySection = ({
  step,
  feedbackMessage,
  inlineError,
  symbolValue,
  quantityValue,
  symbolError,
  quantityError,
  draftSummary,
  canSubmit,
  isInteractionLocked,
  isCreating,
  isVerifyingOtp,
  isExecuting,
  isExtending,
  isRestoring,
  presentation,
  orderSession,
  hasDetectedSessionExpiry = false,
  authorizationReasonMessage,
  otpValue,
  presets,
  selectedPresetId,
  onClear,
  onReset,
  onRestartExpiredSession,
  onBackToDraft,
  onSelectPreset,
  onSetSymbolValue,
  onSetQuantityValue,
  onSetOtpValue,
  onSubmit,
  onExecute,
  onExtend,
}: ExternalOrderRecoverySectionProps) => {
  const countdown = useExpiryCountdown(orderSession?.expiresAt ?? EMPTY_EXPIRY);
  const processingContent = orderSession ? resolveOrderProcessingContent(orderSession.status) : null;
  const finalResultContent = orderSession ? resolveOrderFinalResultContent(orderSession) : null;
  const hasExpiry = orderSession?.expiresAt != null;
  const hasActiveSession = orderSession != null && step !== 'COMPLETE';
  const showExpiredModal =
    hasActiveSession && ((hasExpiry && countdown.isExpired) || hasDetectedSessionExpiry);
  const showExpiryWarning =
    hasActiveSession && hasExpiry && countdown.isExpiringSoon && !showExpiredModal;
  const isExpiredInteractionLocked = isInteractionLocked || showExpiredModal;
  const isCompactExpiryWarning = showExpiryWarning && step === 'B';
  const showProcessingState =
    step === 'COMPLETE' && orderSession != null && isProcessingStatus(orderSession.status);
  const showManualReviewState =
    step === 'COMPLETE' && orderSession != null && isManualReviewStatus(orderSession.status);
  const showResultState =
    step === 'COMPLETE' && orderSession != null && isFinalResultStatus(orderSession.status);
  const hasCompleteStateCard = showProcessingState || showManualReviewState || showResultState;
  const effectiveFeedbackMessage =
    step === 'COMPLETE' && hasCompleteStateCard ? null : feedbackMessage;
  const expiredModalMessage = hasExpiry && countdown.isExpired
    ? `${countdown.expiresAtLabel}에 세션이 종료되었습니다. 입력한 주문을 확인한 뒤 다시 시작해 주세요.`
    : '주문 세션이 더 이상 유효하지 않습니다. 입력한 주문을 확인한 뒤 다시 시작해 주세요.';
  const model = buildExternalOrderRecoverySectionModel({
    step,
    feedbackMessage: effectiveFeedbackMessage,
    inlineError,
    isInteractionLocked: isExpiredInteractionLocked,
    isCreating,
    isVerifyingOtp,
    isExecuting,
    presentation,
    orderSession,
    presets,
    selectedPresetId,
    draftSummary,
  });

  return (
    <View
      style={{
        borderRadius: 26,
        backgroundColor: '#FFFFFF',
        position: 'relative',
        paddingHorizontal: 18,
        paddingVertical: 18,
        gap: 14,
        shadowColor: '#0F172A',
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 12 },
        elevation: 7,
      }}
    >
      <View style={{ gap: 6 }}>
        <Text
          style={{
            fontSize: 11,
            fontWeight: '700',
            color: palette.accentDeep,
            letterSpacing: 0.4,
          }}
        >
          {model.kicker}
        </Text>
        <Text
          style={{
            fontSize: 20,
            lineHeight: 26,
            fontWeight: '800',
            color: palette.ink,
          }}
        >
          {model.title}
        </Text>
        <Text
          style={{
            fontSize: 14,
            lineHeight: 20,
            color: palette.inkSoft,
          }}
        >
          {model.description}
        </Text>
        <Text
          style={{
            fontSize: 13,
            lineHeight: 18,
            fontWeight: '700',
            color: palette.ink,
          }}
          testID="mobile-order-session-selected-summary"
        >
          선택 주문: {model.selectedSummary}
        </Text>
      </View>

      {isRestoring ? (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#E8D9CC',
            backgroundColor: '#FFF8F2',
            paddingHorizontal: 14,
            paddingVertical: 14,
          }}
          testID="mobile-order-session-restoring"
        >
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: palette.ink,
            }}
          >
            진행 중인 주문 세션을 복원하는 중입니다.
          </Text>
        </View>
      ) : null}

      {model.orderSummary ? (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#E8D9CC',
            backgroundColor: '#FFF8F2',
            paddingHorizontal: 14,
            paddingVertical: 14,
          }}
          testID="mobile-order-session-summary"
        >
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: palette.ink,
            }}
          >
            {model.orderSummary}
          </Text>
        </View>
      ) : null}

      {model.feedbackMessage ? (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#E8D9CC',
            backgroundColor: '#FFF8F2',
            paddingHorizontal: 14,
            paddingVertical: 14,
          }}
          testID="mobile-order-session-feedback"
        >
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: palette.ink,
            }}
          >
            {model.feedbackMessage}
          </Text>
        </View>
      ) : null}

      {model.inlineError ? (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#F2A8A1',
            backgroundColor: palette.dangerSoft,
            paddingHorizontal: 14,
            paddingVertical: 14,
          }}
          testID="mobile-order-session-error"
        >
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: palette.ink,
            }}
          >
            {model.inlineError}
          </Text>
        </View>
      ) : null}

      {showExpiryWarning ? (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#F2C38C',
            backgroundColor: '#FFF7ED',
            paddingHorizontal: 14,
            paddingVertical: 14,
            gap: isCompactExpiryWarning ? 8 : 10,
          }}
          testID="mobile-order-session-warning"
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: palette.accentDeep,
            }}
          >
            {isCompactExpiryWarning ? '세션 곧 만료' : '주문 세션이 곧 만료돼요'}
          </Text>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: palette.ink,
            }}
          >
            {isCompactExpiryWarning
              ? countdown.remainingLabel
              : `${countdown.remainingLabel} · 연장하면 입력한 주문은 그대로 유지돼요.`}
          </Text>
          <Pressable
            disabled={isExtending || showExpiredModal}
            onPress={onExtend}
            style={{
              minHeight: 44,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: '#E8D9CC',
              backgroundColor: isExtending ? '#F8F1EA' : '#FFFFFF',
            }}
            testID="mobile-order-session-extend"
          >
            <Text
              style={{
              fontSize: 14,
              fontWeight: '800',
              color: palette.ink,
            }}
          >
              {isExtending ? '세션 연장 중...' : '세션 연장'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {model.scenarios.map((scenario) => (
          <Pressable
            key={scenario.id}
            accessibilityRole="button"
            accessibilityState={{
              selected: scenario.isSelected,
              disabled: scenario.isDisabled,
            }}
            disabled={scenario.isDisabled}
            onPress={() => onSelectPreset(scenario.id)}
            style={{
              minWidth: 70,
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: scenario.isSelected ? palette.accent : '#E8D9CC',
              backgroundColor: scenario.isSelected ? palette.accent : '#FFFFFF',
            }}
            testID={scenario.testId}
          >
            <Text
              style={{
              fontSize: 13,
              fontWeight: '800',
                color: scenario.isSelected ? '#FFFFFF' : palette.inkSoft,
                textAlign: 'center',
              }}
            >
              {scenario.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {step === 'A' ? (
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: palette.inkSoft,
            }}
          >
            종목코드
          </Text>
          <TextInput
            accessibilityLabel="주문 종목코드 입력"
            keyboardType="number-pad"
            maxLength={6}
            editable={!isExpiredInteractionLocked}
            value={symbolValue}
            onChangeText={onSetSymbolValue}
            style={{
              minHeight: 50,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: symbolError ? '#F2A8A1' : '#E8D9CC',
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 14,
              fontSize: 18,
              fontWeight: '700',
              color: palette.ink,
              letterSpacing: 2,
            }}
            testID="mobile-order-input-symbol"
          />
          {symbolError ? (
            <Text
              style={{
                fontSize: 13,
                lineHeight: 18,
                color: '#B45309',
              }}
              testID="mobile-order-input-symbol-error"
            >
              {symbolError}
            </Text>
          ) : null}

          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: palette.inkSoft,
            }}
          >
            수량
          </Text>
          <TextInput
            accessibilityLabel="주문 수량 입력"
            keyboardType="number-pad"
            maxLength={6}
            editable={!isExpiredInteractionLocked}
            value={quantityValue}
            onChangeText={onSetQuantityValue}
            style={{
              minHeight: 50,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: quantityError ? '#F2A8A1' : '#E8D9CC',
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 14,
              fontSize: 18,
              fontWeight: '700',
              color: palette.ink,
            }}
            testID="mobile-order-input-qty"
          />
          {quantityError ? (
            <Text
              style={{
                fontSize: 13,
                lineHeight: 18,
                color: '#B45309',
              }}
              testID="mobile-order-input-qty-error"
            >
              {quantityError}
            </Text>
          ) : null}
        </View>
      ) : null}

      {step === 'B' || step === 'C' ? (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#E8D9CC',
            backgroundColor: '#FFFDF9',
            paddingHorizontal: 14,
            paddingVertical: 14,
            gap: 8,
          }}
          testID="mobile-order-session-authorization"
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: palette.accentDeep,
            }}
          >
            인증 안내
          </Text>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: palette.ink,
            }}
          >
            {authorizationReasonMessage}
          </Text>
        </View>
      ) : null}

      {step === 'B' ? (
        <View style={{ gap: 8 }}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: palette.inkSoft,
            }}
          >
            {model.otpInput.helperText}
          </Text>
          <TextInput
            accessibilityLabel="주문 OTP 입력"
            autoComplete="one-time-code"
            keyboardType="number-pad"
            maxLength={6}
            editable={model.otpInput.editable && !showExpiredModal}
            value={otpValue}
            onChangeText={onSetOtpValue}
            style={{
              minHeight: 50,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: '#E8D9CC',
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 14,
              fontSize: 18,
              fontWeight: '700',
              color: palette.ink,
              letterSpacing: 4,
            }}
            testID={model.otpInput.testId}
          />
        </View>
      ) : null}

      {showProcessingState ? (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#E8D9CC',
            backgroundColor: '#FFF8F2',
            paddingHorizontal: 14,
            paddingVertical: 14,
            gap: 6,
          }}
          testID="mobile-order-session-processing"
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: '800',
              color: palette.ink,
            }}
            testID="mobile-order-session-processing-title"
          >
            {processingContent?.title}
          </Text>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: palette.inkSoft,
            }}
            testID="mobile-order-session-processing-body"
          >
            {processingContent?.body}
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: palette.ink,
            }}
            testID="mobile-order-result-clordid"
          >
            ClOrdID · {orderSession.clOrdId}
          </Text>
        </View>
      ) : null}

      {showManualReviewState ? (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#F2C38C',
            backgroundColor: '#FFF7ED',
            paddingHorizontal: 14,
            paddingVertical: 14,
            gap: 6,
          }}
          testID="mobile-order-session-manual-review"
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: '800',
              color: palette.ink,
            }}
            testID="mobile-order-session-processing-title"
          >
            {processingContent?.title}
          </Text>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: palette.inkSoft,
            }}
            testID="mobile-order-session-processing-body"
          >
            {processingContent?.body}
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: palette.ink,
            }}
            testID="mobile-order-result-clordid"
          >
            ClOrdID · {orderSession.clOrdId}
          </Text>
        </View>
      ) : null}

      {showResultState ? (
        <View
          style={{
            borderRadius: 18,
            borderWidth: 1,
            borderColor: '#E8D9CC',
            backgroundColor: '#FFF8F2',
            paddingHorizontal: 14,
            paddingVertical: 14,
            gap: 6,
          }}
          testID="mobile-order-session-result"
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: '800',
              color: palette.ink,
            }}
            testID="mobile-order-session-result-title"
          >
            {finalResultContent?.title}
          </Text>
          <Text
            style={{
              fontSize: 14,
              lineHeight: 20,
              color: palette.inkSoft,
            }}
            testID="mobile-order-session-result-body"
          >
            {finalResultContent?.body}
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '700',
              color: palette.ink,
            }}
            testID="mobile-order-result-clordid"
          >
            ClOrdID · {orderSession.clOrdId}
          </Text>
          {orderSession.externalOrderId ? (
            <Text
              style={{
                fontSize: 13,
                color: palette.ink,
              }}
              testID="mobile-order-result-external-id"
            >
              거래소 주문번호 · {orderSession.externalOrderId}
            </Text>
          ) : null}
          {orderSession.executionResult ? (
            <Text
              style={{
                fontSize: 13,
                color: palette.ink,
              }}
              testID="mobile-order-result-execution-result"
            >
              실행 결과 · {orderSession.executionResult}
            </Text>
          ) : null}
          {orderSession.executedQty !== null && orderSession.executedQty !== undefined ? (
            <Text
              style={{
                fontSize: 13,
                color: palette.ink,
              }}
              testID="mobile-order-result-executed-qty"
            >
              체결 수량 · {formatQuantity(orderSession.executedQty)}주
            </Text>
          ) : null}
          {orderSession.executedPrice !== null && orderSession.executedPrice !== undefined ? (
            <Text
              style={{
                fontSize: 13,
                color: palette.ink,
              }}
              testID="mobile-order-result-executed-price"
            >
              체결 단가 · {formatKRW(orderSession.executedPrice)}
            </Text>
          ) : null}
          {orderSession.leavesQty !== null && orderSession.leavesQty !== undefined ? (
            <Text
              style={{
                fontSize: 13,
                color: palette.ink,
              }}
              testID="mobile-order-result-leaves-qty"
            >
              잔여 수량 · {formatQuantity(orderSession.leavesQty)}주
            </Text>
          ) : null}
          {orderSession.canceledAt ? (
            <Text
              style={{
                fontSize: 13,
                color: palette.ink,
              }}
              testID="mobile-order-result-canceled-at"
            >
              취소 시각 · {orderSession.canceledAt}
            </Text>
          ) : null}
          {orderSession.failureReason ? (
            <Text
              style={{
                fontSize: 13,
                color: palette.ink,
              }}
              testID="mobile-order-result-failure-reason"
            >
              실패 사유 · {orderSession.failureReason}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {step === 'A' ? (
          <Pressable
            disabled={!canSubmit || showExpiredModal}
            onPress={onSubmit}
            style={{
              flex: 1,
              minHeight: 50,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor:
                !canSubmit ? '#F7C9A8' : palette.accent,
            }}
            testID={model.createAction.testId}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '800',
                color: '#FFFFFF',
              }}
            >
              {model.createAction.label}
            </Text>
          </Pressable>
        ) : null}

        {step === 'C' ? (
          <Pressable
            disabled={model.executeAction.disabled || showExpiredModal}
            onPress={onExecute}
            style={{
              flex: 1,
              minHeight: 50,
              borderRadius: 18,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: model.executeAction.disabled ? '#F7C9A8' : palette.accent,
            }}
            testID={model.executeAction.testId}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '800',
                color: '#FFFFFF',
              }}
            >
              {model.executeAction.label}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          disabled={
            showExpiredModal
              ? true
              : step === 'A'
              ? model.clearAction.disabled
              : step === 'B'
                ? false
                : model.resetAction.disabled
          }
          onPress={step === 'A' ? onClear : step === 'B' ? onBackToDraft : onReset}
          style={{
            flex: 1,
            minHeight: 50,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: '#E8D9CC',
            backgroundColor:
              (
                showExpiredModal
                  ? true
                  : step === 'A'
                  ? model.clearAction.disabled
                  : step === 'B'
                    ? false
                    : model.resetAction.disabled
              ) ? '#F8F1EA' : '#FFFFFF',
          }}
          testID={
            step === 'A'
              ? model.clearAction.testId
              : step === 'B'
                ? 'mobile-order-session-back'
                : model.resetAction.testId
          }
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: '800',
              color: palette.ink,
            }}
          >
            {step === 'A'
              ? model.clearAction.label
              : step === 'B'
                ? 'Step A로 돌아가기'
                : model.resetAction.label}
          </Text>
        </Pressable>
      </View>

      {presentation ? (
        <ExternalOrderErrorCard presentation={presentation} />
      ) : null}

      {showExpiredModal ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            borderRadius: 26,
            backgroundColor: 'rgba(15, 23, 42, 0.42)',
            paddingHorizontal: 18,
            paddingVertical: 18,
            justifyContent: 'center',
          }}
          testID="mobile-order-session-expired-modal"
        >
          <View
            style={{
              borderRadius: 22,
              backgroundColor: '#FFFFFF',
              paddingHorizontal: 18,
              paddingVertical: 18,
              gap: 10,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                lineHeight: 24,
                fontWeight: '800',
                color: palette.ink,
              }}
            >
              세션이 만료되었습니다
            </Text>
            <Text
              style={{
                fontSize: 14,
                lineHeight: 20,
                color: palette.inkSoft,
              }}
            >
              {expiredModalMessage}
            </Text>
            <Pressable
              onPress={onRestartExpiredSession}
              style={{
                minHeight: 48,
                borderRadius: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: palette.accent,
              }}
              testID="mobile-order-session-expired-restart"
            >
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: '#FFFFFF',
                }}
              >
                새 주문 시작
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
};
