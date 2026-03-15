import { useEffect, useEffectEvent, useRef, useState } from 'react';

import type { OrderApi, OrderSessionResponse } from '../api/order-api';
import { resolveDemoOrderOtpCode, resolveRuntimeUrlOverride } from '../config/runtime-options';
import {
  buildExternalOrderDraftSummary,
  buildExternalOrderRequest,
  createInitialExternalOrderDraft,
  draftFromPreset,
  externalOrderPresetOptions,
  matchPresetIdFromDraft,
  type ExternalOrderPresetId,
  type ExternalOrderFieldErrors,
  validateExternalOrderDraft,
} from './external-order-recovery';
import {
  isVisibleExternalOrderError,
  resolveExternalOrderErrorPresentation,
  type ExternalOrderErrorPresentation,
} from './external-errors';
import {
  __resetOrderSessionStorageForTests,
  clearPersistedOrderSessionId,
  persistOrderSessionId,
  readPersistedOrderSessionId,
} from './order-session-storage';

interface UseExternalOrderViewModelInput {
  accountId?: string;
  isRefreshingSession: boolean;
  orderApi: OrderApi;
}

type OrderFlowStep = 'A' | 'B' | 'C' | 'COMPLETE';

const ORDER_STATUS_POLL_INTERVAL_MS = 30_000;

export const __resetPersistedOrderSessionForTests = () => {
  __resetOrderSessionStorageForTests();
};

const authorizationReasonMessage = (reason?: string) => {
  if (reason === 'RECENT_LOGIN_MFA' || reason === 'TRUSTED_AUTH_SESSION') {
    return '현재 신뢰 세션이 유효하여 추가 OTP 없이 바로 주문을 실행할 수 있습니다.';
  }

  return '고위험 주문으로 분류되어 주문 실행 전에 OTP 인증이 필요합니다.';
};

const canonicalizeErrorCode = (code?: string) =>
  typeof code === 'string' && /^[A-Z]+_[0-9]{3}$/.test(code)
    ? code.replace(/_/g, '-')
    : code;

const getErrorCode = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error
    ? canonicalizeErrorCode((error as { code?: string }).code)
    : undefined;

const isFinalResultStatus = (status?: string) =>
  status === 'COMPLETED'
  || status === 'FAILED'
  || status === 'CANCELED';

const isServerExpiredStatus = (status?: string) => status === 'EXPIRED';

const isPollingStatus = (status?: string) =>
  status === 'EXECUTING'
  || status === 'REQUERYING'
  || status === 'ESCALATED';

const isSessionExpiredError = (error: unknown) => {
  const code = getErrorCode(error);
  return code === 'ORD-008' || code === 'CHANNEL-001';
};

const resolveInFlightGuidance = (status?: string) => {
  if (status === 'EXECUTING') {
    return '주문을 거래소에 전송했습니다. 체결 결과를 확인하는 중입니다.';
  }

  if (status === 'REQUERYING') {
    return '체결 결과를 다시 확인하고 있습니다. 잠시만 기다려 주세요.';
  }

  if (status === 'ESCALATED') {
    return '처리 중 문제가 발생해 수동 확인이 필요합니다. 고객센터에 문의해 주세요.';
  }

  return null;
};

const resolveFinalResultGuidance = (session: OrderSessionResponse) => {
  if (session.status === 'FAILED') {
    return '주문이 최종 실패했습니다. 실패 사유를 확인한 뒤 새 주문을 시작해 주세요.';
  }

  if (session.status === 'CANCELED') {
    if (session.executionResult === 'PARTIAL_FILL_CANCEL') {
      return '일부 수량이 체결된 뒤 나머지 수량이 취소되었습니다.';
    }

    return '주문이 취소되었습니다.';
  }

  if (session.executionResult === 'PARTIAL_FILL') {
    return '주문이 일부 체결되었습니다. 잔여 수량을 확인해 주세요.';
  }

  if (session.executionResult === 'VIRTUAL_FILL') {
    return '주문이 승인 처리되었습니다. 주문 결과를 확인해 주세요.';
  }

  return '주문이 접수되었습니다. 주문 요약을 확인해 주세요.';
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '주문 요청 처리 중 문제가 발생했습니다.';

const formatOtpError = (error: unknown) => {
  const code = getErrorCode(error);

  if (
    typeof error === 'object'
    && error !== null
    && code === 'CHANNEL-002'
    && 'remainingAttempts' in error
    && typeof (error as { remainingAttempts?: unknown }).remainingAttempts === 'number'
  ) {
    return `OTP 코드가 일치하지 않습니다. 남은 시도 ${(error as { remainingAttempts: number }).remainingAttempts}회`;
  }

  if (code === 'AUTH-011') {
    return '이미 사용한 OTP 코드입니다. 새 코드가 표시되면 다시 입력해 주세요.';
  }

  if (code === 'RATE-001') {
    return 'OTP를 너무 빠르게 연속 제출했습니다. 잠시 후 다시 시도해 주세요.';
  }

  if (code === 'ORD-009') {
    return '현재 주문 세션 상태에서는 OTP를 다시 확인할 수 없습니다. 주문 상태를 새로 확인해 주세요.';
  }

  return getErrorMessage(error);
};

const resolveServerValidationFieldErrors = (
  error: unknown,
): {
  fieldErrors: ExternalOrderFieldErrors;
  guidance: string | null;
  inlineError: string | null;
} => {
  if (typeof error !== 'object' || error === null) {
    return {
      fieldErrors: {},
      guidance: null,
      inlineError: null,
    };
  }

  const normalized = error as {
    code?: string;
    message?: string;
  };
  const message = normalized.message ?? '';

  if (
    normalized.code === 'ORD-001'
    || /available cash|insufficient cash|매수 자금|가용 현금|cash/i.test(message)
  ) {
    return {
      fieldErrors: {},
      guidance: '매수 가능 금액을 확인하거나 수량을 조정한 뒤 다시 시도해 주세요.',
      inlineError: message,
    };
  }

  if (
    normalized.code === 'ORD-002'
    || /daily sell limit|매도 한도/i.test(message)
  ) {
    return {
      fieldErrors: {},
      guidance: '일일 매도 가능 한도를 확인한 뒤 다시 시도해 주세요.',
      inlineError: message,
    };
  }

  if (
    normalized.code === 'ORD-003'
    || /수량|quantity|position|가용/i.test(message)
  ) {
    return {
      fieldErrors: {
        quantity: message,
      },
      guidance: null,
      inlineError: null,
    };
  }

  if (/종목|symbol/i.test(message)) {
    return {
      fieldErrors: {
        symbol: message,
      },
      guidance: null,
      inlineError: null,
    };
  }

  return {
    fieldErrors: {},
    guidance: null,
    inlineError: null,
  };
};

const buildServerValidationGuidance = (errors: ExternalOrderFieldErrors) => {
  if (errors.symbol && errors.quantity) {
    return '입력값을 수정한 뒤 다시 시도해 주세요.';
  }

  if (errors.symbol) {
    return '종목코드를 수정한 뒤 다시 시도해 주세요.';
  }

  if (errors.quantity) {
    return '수량을 수정한 뒤 다시 시도해 주세요.';
  }

  return null;
};

export const useExternalOrderViewModel = ({
  accountId,
  isRefreshingSession,
  orderApi,
}: UseExternalOrderViewModelInput) => {
  const demoOrderOtpCodeRef = useRef(resolveDemoOrderOtpCode());
  const runtimeUrlOverrideRef = useRef(resolveRuntimeUrlOverride());
  const [selectedPresetId, setSelectedPresetId] = useState<ExternalOrderPresetId | null>(
    externalOrderPresetOptions[0].id,
  );
  const [draft, setDraft] = useState(createInitialExternalOrderDraft);
  const [step, setStep] = useState<OrderFlowStep>('A');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [serverFieldErrors, setServerFieldErrors] = useState<ExternalOrderFieldErrors>({});
  const [presentation, setPresentation] =
    useState<ExternalOrderErrorPresentation | null>(null);
  const [orderSession, setOrderSession] = useState<OrderSessionResponse | null>(null);
  const [hasDetectedSessionExpiry, setHasDetectedSessionExpiry] = useState(false);
  const [otpValue, setOtpValue] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const operationVersionRef = useRef(0);
  const fieldErrors = validateExternalOrderDraft(draft);
  const mergedFieldErrors: ExternalOrderFieldErrors = {
    symbol: fieldErrors.symbol ?? serverFieldErrors.symbol,
    quantity: fieldErrors.quantity ?? serverFieldErrors.quantity,
  };
  const isInteractionLocked =
    isCreating || isVerifyingOtp || isExecuting || isRestoring || isExtending;
  const canSubmit =
    !mergedFieldErrors.symbol
    && !mergedFieldErrors.quantity
    && !isInteractionLocked;

  const clearTransientFeedback = (options?: { preservePresentation?: boolean }) => {
    setFeedbackMessage(null);
    setInlineError(null);
    if (!options?.preservePresentation) {
      setPresentation(null);
    }
  };

  const invalidatePendingOperations = () => {
    operationVersionRef.current += 1;
  };

  const clearServerFieldErrors = (targets?: Array<keyof ExternalOrderFieldErrors>) => {
    if (!targets || targets.length === 0) {
      setServerFieldErrors({});
      return;
    }

    setServerFieldErrors((current) => {
      const next = { ...current };
      for (const target of targets) {
        delete next[target];
      }
      return next;
    });
  };

  const reportStorageFailure = (error: unknown) => {
    setInlineError(getErrorMessage(error));
  };

  const clearPersistedSessionContext = () => {
    void clearPersistedOrderSessionId(accountId).catch(reportStorageFailure);
  };

  const persistSessionContext = (orderSessionId: string) => {
    void persistOrderSessionId(accountId, orderSessionId).catch(reportStorageFailure);
  };

  const reset = (options?: { keepPreset?: boolean; message?: string }) => {
    invalidatePendingOperations();
    clearPersistedSessionContext();
    setStep('A');
    setFeedbackMessage(null);
    setInlineError(options?.message ?? null);
    clearServerFieldErrors();
    setPresentation(null);
    setOrderSession(null);
    setHasDetectedSessionExpiry(false);
    setOtpValue('');
    setIsCreating(false);
    setIsVerifyingOtp(false);
    setIsExecuting(false);
    setIsExtending(false);
    if (!options?.keepPreset) {
      setDraft(createInitialExternalOrderDraft());
      setSelectedPresetId(externalOrderPresetOptions[0].id);
    }
  };

  const discardDraftSessionContext = () => {
    if (orderSession === null) {
      return;
    }

    invalidatePendingOperations();
    clearPersistedSessionContext();
    setOrderSession(null);
    setHasDetectedSessionExpiry(false);
    setOtpValue('');
    setPresentation(null);
    setInlineError(null);
    setFeedbackMessage(null);
    setIsExtending(false);
  };

  const goBackToDraft = () => {
    if (orderSession === null) {
      setStep('A');
      return;
    }

    invalidatePendingOperations();
    setHasDetectedSessionExpiry(false);
    setStep('A');
    setOtpValue('');
    setIsVerifyingOtp(false);
    clearTransientFeedback();
    setFeedbackMessage(authorizationReasonMessage(orderSession.authorizationReason));
  };

  const restartExpiredSession = () => {
    reset({
      keepPreset: true,
      message: '주문 세션이 만료되었습니다. 입력한 주문을 확인한 뒤 다시 시작해 주세요.',
    });
  };

  const markSessionExpired = (
    session?: OrderSessionResponse | null,
  ) => {
    const expiredSession = session ?? orderSession;
    if (!expiredSession) {
      reset({
        keepPreset: true,
        message: '주문 세션이 만료되었습니다. 입력한 주문을 확인한 뒤 다시 시작해 주세요.',
      });
      return;
    }

    invalidatePendingOperations();
    clearPersistedSessionContext();
    clearServerFieldErrors();
    setPresentation(null);
    setFeedbackMessage(null);
    setInlineError(null);
    setOrderSession(expiredSession);
    setHasDetectedSessionExpiry(true);
    setOtpValue('');
    setIsCreating(false);
    setIsVerifyingOtp(false);
    setIsExecuting(false);
    setIsExtending(false);
    setStep(expiredSession.challengeRequired ? 'B' : 'C');
  };

  const applySessionState = (
    session: OrderSessionResponse,
    options?: { restoring?: boolean; preservePresentation?: boolean },
  ) => {
    setOrderSession(session);
    setHasDetectedSessionExpiry(false);
    clearServerFieldErrors();
    setDraft({
      symbol: session.symbol,
      quantity: String(session.qty),
    });
    setSelectedPresetId(matchPresetIdFromDraft({
      symbol: session.symbol,
      quantity: String(session.qty),
    }));
    persistSessionContext(session.orderSessionId);
    clearTransientFeedback({
      preservePresentation: options?.preservePresentation,
    });

    if (session.status === 'AUTHED') {
      setStep('C');
      if (!options?.restoring) {
        setFeedbackMessage(authorizationReasonMessage(session.authorizationReason));
      }
      return;
    }

    if (session.status === 'PENDING_NEW' && session.challengeRequired) {
      setStep('B');
      return;
    }

    if (isPollingStatus(session.status)) {
      setStep('COMPLETE');
      setFeedbackMessage(resolveInFlightGuidance(session.status));
      return;
    }

    if (isFinalResultStatus(session.status)) {
      setStep('COMPLETE');
      setFeedbackMessage(resolveFinalResultGuidance(session));
      clearPersistedSessionContext();
      return;
    }

    if (isServerExpiredStatus(session.status)) {
      markSessionExpired(session);
      return;
    }

    setStep('A');
  };
  const applySessionStateEvent = useEffectEvent(applySessionState);
  const resetEvent = useEffectEvent(reset);
  const markSessionExpiredEvent = useEffectEvent(markSessionExpired);

  useEffect(() => {
    let cancelled = false;
    const restoreVersion = operationVersionRef.current;

    const restore = async () => {
      if (!accountId || isRefreshingSession) {
        return;
      }

      let storedOrderSessionId: string | null;
      try {
        storedOrderSessionId = await readPersistedOrderSessionId(accountId);
      } catch (error) {
        if (!cancelled && restoreVersion === operationVersionRef.current) {
          reportStorageFailure(error);
        }
        return;
      }

      if (
        cancelled
        || restoreVersion !== operationVersionRef.current
        || !storedOrderSessionId
      ) {
        return;
      }

      setIsRestoring(true);
      try {
        const session = await orderApi.getOrderSession(storedOrderSessionId);
        if (!cancelled && restoreVersion === operationVersionRef.current) {
          applySessionStateEvent(session, { restoring: true });
        }
      } catch (error) {
        if (!cancelled && restoreVersion === operationVersionRef.current) {
          if (isSessionExpiredError(error)) {
            resetEvent({
              keepPreset: true,
              message: '주문 세션이 만료되었습니다. 입력한 주문을 확인한 뒤 다시 시작해 주세요.',
            });
            return;
          }
          resetEvent({
            keepPreset: true,
            message: getErrorMessage(error),
          });
        }
      } finally {
        if (!cancelled && restoreVersion === operationVersionRef.current) {
          setIsRestoring(false);
        }
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [accountId, isRefreshingSession, orderApi]);

  useEffect(() => {
    const pollingOrderSessionId = orderSession?.orderSessionId ?? null;
    const pollingOrderSessionStatus = orderSession?.status ?? null;

    if (!pollingOrderSessionId || !pollingOrderSessionStatus || !isPollingStatus(pollingOrderSessionStatus)) {
      return;
    }

    let cancelled = false;

    const pollOrderSession = async () => {
      try {
        const session = await orderApi.getOrderSession(pollingOrderSessionId);
        if (!session) {
          return;
        }
        if (!cancelled) {
          applySessionStateEvent(session, {
            restoring: true,
            preservePresentation: presentation !== null && isPollingStatus(session.status),
          });
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (isSessionExpiredError(error)) {
          markSessionExpiredEvent();
          return;
        }

        setInlineError(getErrorMessage(error));
      }
    };

    const intervalId = setInterval(() => {
      void pollOrderSession();
    }, ORDER_STATUS_POLL_INTERVAL_MS);
    void pollOrderSession();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [
    applySessionStateEvent,
    markSessionExpiredEvent,
    orderApi,
    orderSession?.orderSessionId,
    orderSession?.status,
    presentation,
  ]);

  const refreshOrderSessionState = async (
    currentOrderSessionId: string,
    operationVersion: number,
    options?: { preservePresentation?: boolean },
  ) => {
    try {
      const session = await orderApi.getOrderSession(currentOrderSessionId);
      if (!session) {
        return false;
      }
      if (operationVersion !== operationVersionRef.current) {
        return true;
      }
      applySessionState(session, {
        preservePresentation: options?.preservePresentation,
      });
      return true;
    } catch (error) {
      if (operationVersion !== operationVersionRef.current) {
        return true;
      }
      if (isSessionExpiredError(error)) {
        markSessionExpired();
        return true;
      }
      return false;
    }
  };

  const handleOtpFailure = async (error: unknown, operationVersion: number) => {
    setOtpValue('');

    if (isSessionExpiredError(error)) {
      markSessionExpired();
      return;
    }

    const code = getErrorCode(error);
    if (code === 'CHANNEL-003') {
      reset({
        keepPreset: true,
        message: 'OTP 시도 횟수를 모두 사용했습니다. 새 주문을 다시 시작해 주세요.',
      });
      return;
    }

    if (code === 'ORD-009' && orderSession) {
      const handled = await refreshOrderSessionState(orderSession.orderSessionId, operationVersion);
      if (handled) {
        return;
      }
    }

    setInlineError(formatOtpError(error));
  };

  const verifyOtp = async (otpCode: string) => {
    if (!orderSession || isVerifyingOtp || otpCode.length !== 6) {
      return;
    }

    clearTransientFeedback();
    setIsVerifyingOtp(true);
    const operationVersion = ++operationVersionRef.current;

    try {
      const session = await orderApi.verifyOrderSessionOtp(orderSession.orderSessionId, otpCode);
      if (operationVersion === operationVersionRef.current) {
        setOtpValue('');
        applySessionState(session);
      }
    } catch (error) {
      if (operationVersion === operationVersionRef.current) {
        await handleOtpFailure(error, operationVersion);
      }
    } finally {
      if (operationVersion === operationVersionRef.current) {
        setIsVerifyingOtp(false);
      }
    }
  };

  useEffect(() => {
    const isLocalStepUpDemo =
      orderSession?.accountId === 12
      && runtimeUrlOverrideRef.current?.includes('localhost:18080') === true;
    const demoOrderOtpCode = demoOrderOtpCodeRef.current ?? (isLocalStepUpDemo ? '123456' : null);
    if (
      step !== 'B'
      || !orderSession
      || isVerifyingOtp
      || demoOrderOtpCode === null
    ) {
      return;
    }

    let cancelled = false;
    const timeoutId = setTimeout(() => {
      void (async () => {
        try {
          if (!cancelled) {
            await verifyOtp(demoOrderOtpCode);
          }
        } catch {
          return;
        }
      })();
    }, 900);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [isVerifyingOtp, orderApi, orderSession, step]);

  const submit = async () => {
    if (isCreating || isVerifyingOtp || isExecuting) {
      return;
    }

    if (mergedFieldErrors.symbol || mergedFieldErrors.quantity) {
      setInlineError(null);
      setPresentation(null);
      return;
    }

    const request = buildExternalOrderRequest({
      accountId,
      symbol: draft.symbol,
      quantity: draft.quantity,
    });

    if (!request) {
      setInlineError('주문에 사용할 계좌 정보를 확인할 수 없습니다.');
      setPresentation(null);
      return;
    }

    clearTransientFeedback();
    clearServerFieldErrors();
    setIsCreating(true);
    const operationVersion = ++operationVersionRef.current;

    try {
      const session = await orderApi.createOrderSession(request);
      if (operationVersion === operationVersionRef.current) {
        applySessionState(session);
      }
    } catch (error) {
      if (operationVersion !== operationVersionRef.current) {
        return;
      }

      const validationPresentation = resolveServerValidationFieldErrors(error);
      if (
        validationPresentation.fieldErrors.symbol
        || validationPresentation.fieldErrors.quantity
      ) {
        setServerFieldErrors(validationPresentation.fieldErrors);
        setInlineError(validationPresentation.inlineError);
        setFeedbackMessage(
          validationPresentation.guidance
          ?? buildServerValidationGuidance(validationPresentation.fieldErrors),
        );
        return;
      }

      if (validationPresentation.guidance || validationPresentation.inlineError) {
        setFeedbackMessage(validationPresentation.guidance);
        setInlineError(validationPresentation.inlineError);
        return;
      }

      setInlineError(getErrorMessage(error));
    } finally {
      if (operationVersion === operationVersionRef.current) {
        setIsCreating(false);
      }
    }
  };

  const execute = async () => {
    if (!orderSession || isExecuting) {
      return;
    }

    clearTransientFeedback();
    setIsExecuting(true);
    const operationVersion = ++operationVersionRef.current;

    try {
      const session = await orderApi.executeOrderSession(orderSession.orderSessionId);
      if (operationVersion === operationVersionRef.current) {
        applySessionState(session);
      }
    } catch (error) {
      if (operationVersion !== operationVersionRef.current) {
        return;
      }

      if (isSessionExpiredError(error)) {
        markSessionExpired();
        return;
      }

      if (getErrorCode(error) === 'ORD-009') {
        const handled = await refreshOrderSessionState(orderSession.orderSessionId, operationVersion);
        if (handled) {
          return;
        }
      }

      if (isVisibleExternalOrderError(error)) {
        setPresentation(resolveExternalOrderErrorPresentation(error));
        const handled = await refreshOrderSessionState(
          orderSession.orderSessionId,
          operationVersion,
          { preservePresentation: true },
        );
        if (handled) {
          return;
        }
      } else {
        setInlineError(getErrorMessage(error));
      }
    } finally {
      if (operationVersion === operationVersionRef.current) {
        setIsExecuting(false);
      }
    }
  };

  const extend = async () => {
    if (!orderSession || isExtending) {
      return;
    }

    clearTransientFeedback();
    setIsExtending(true);
    const operationVersion = ++operationVersionRef.current;

    try {
      const session = await orderApi.extendOrderSession(orderSession.orderSessionId);
      if (operationVersion === operationVersionRef.current) {
        applySessionState(session);
      }
    } catch (error) {
      if (operationVersion !== operationVersionRef.current) {
        return;
      }
      if (isSessionExpiredError(error)) {
        markSessionExpired();
        return;
      }
      setInlineError(getErrorMessage(error));
    } finally {
      if (operationVersion === operationVersionRef.current) {
        setIsExtending(false);
      }
    }
  };

  return {
    authorizationReasonMessage:
      orderSession ? authorizationReasonMessage(orderSession.authorizationReason) : null,
    clear: clearTransientFeedback,
    extend,
    execute,
    feedbackMessage,
    inlineError,
    symbolValue: draft.symbol,
    quantityValue: draft.quantity,
    symbolError: mergedFieldErrors.symbol ?? null,
    quantityError: mergedFieldErrors.quantity ?? null,
    draftSummary: buildExternalOrderDraftSummary(draft),
    canSubmit,
    isInteractionLocked,
    isCreating,
    isExtending,
    isExecuting,
    isRestoring,
    isVerifyingOtp,
    hasDetectedSessionExpiry,
    orderSession,
    otpValue,
    presentation,
    presets: externalOrderPresetOptions,
    reset,
    restartExpiredSession,
    backToDraft: goBackToDraft,
    selectPreset: (presetId: ExternalOrderPresetId) => {
      invalidatePendingOperations();
      clearTransientFeedback();
      setSelectedPresetId(presetId);
      setDraft(draftFromPreset(presetId));
      if (orderSession !== null) {
        reset({ keepPreset: true });
      }
    },
    selectedPresetId,
    setSymbolValue: (value: string) => {
      invalidatePendingOperations();
      clearTransientFeedback();
      clearServerFieldErrors(['symbol']);
      if (orderSession !== null && step === 'A') {
        discardDraftSessionContext();
      }
      const nextDraft = {
        ...draft,
        symbol: value,
      };
      setDraft(nextDraft);
      setSelectedPresetId(matchPresetIdFromDraft(nextDraft));
    },
    setQuantityValue: (value: string) => {
      invalidatePendingOperations();
      clearTransientFeedback();
      clearServerFieldErrors(['quantity']);
      if (orderSession !== null && step === 'A') {
        discardDraftSessionContext();
      }
      const nextDraft = {
        ...draft,
        quantity: value.replace(/[^\d]/g, '').slice(0, 6),
      };
      setDraft(nextDraft);
      setSelectedPresetId(matchPresetIdFromDraft(nextDraft));
    },
    setOtpValue: (value: string) => {
      const digitsOnly = value.replace(/\D/g, '').slice(0, 6);
      setOtpValue(digitsOnly);
      setInlineError(null);
      if (step === 'B' && digitsOnly.length === 6) {
        void verifyOtp(digitsOnly);
      }
    },
    step,
    submit,
  };
};
