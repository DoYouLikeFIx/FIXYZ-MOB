import { useEffect, useEffectEvent, useReducer, useRef, useState } from 'react';

import type { AccountApi } from '../api/account-api';
import type { OrderApi } from '../api/order-api';
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
} from './external-errors';
import {
  getOrderReasonCategoryLabel,
  resolveOrderReasonCategory,
} from './order-error-category';
import {
  resolveOrderAuthorizationGuidance,
  resolveOrderFinalResultContent,
  resolveOrderProcessingContent,
} from './order-session-guidance';
import type {
  OrderSessionResponse,
  OrderSessionStatus,
} from '../types/order';
import {
  __resetOrderSessionStorageForTests,
  clearPersistedOrderSessionId,
  persistOrderSessionId,
  readPersistedOrderSessionId,
} from './order-session-storage';
import {
  initialOrderFlowState,
  orderFlowReducer,
} from './order-flow-state';

interface UseExternalOrderViewModelInput {
  accountId?: string;
  accountApi: Pick<AccountApi, 'fetchAccountPosition'>;
  isRefreshingSession: boolean;
  orderApi: OrderApi;
}

const ORDER_STATUS_POLL_INTERVAL_MS = 30_000;
const POSITION_EXECUTION_RESULTS = new Set([
  'FILLED',
  'PARTIAL_FILL',
  'VIRTUAL_FILL',
  'PARTIAL_FILL_CANCEL',
]);

export const __resetPersistedOrderSessionForTests = () => {
  __resetOrderSessionStorageForTests();
};

const canonicalizeErrorCode = (code?: string) =>
  typeof code === 'string' && /^[A-Z]+_[0-9]{3}$/.test(code)
    ? code.replace(/_/g, '-')
    : code;

const getErrorCode = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error
    ? canonicalizeErrorCode((error as { code?: string }).code)
    : undefined;

const isFinalResultStatus = (status?: OrderSessionStatus | null) =>
  status === 'COMPLETED'
  || status === 'FAILED'
  || status === 'CANCELED';

const isServerExpiredStatus = (status?: OrderSessionStatus | null) => status === 'EXPIRED';

const isPollingStatus = (status?: OrderSessionStatus | null) =>
  status === 'EXECUTING'
  || status === 'REQUERYING'
  || status === 'ESCALATED';

const shouldLoadUpdatedPositionQuantity = (session?: OrderSessionResponse | null) =>
  Boolean(
    session
    && isFinalResultStatus(session.status)
    && session.executionResult
    && POSITION_EXECUTION_RESULTS.has(session.executionResult),
  );

const isSessionExpiredError = (error: unknown) => {
  const code = getErrorCode(error);
  return code === 'ORD-008' || code === 'CHANNEL-001';
};

const resolveInFlightGuidance = (status?: OrderSessionStatus | null) => {
  const processingContent = resolveOrderProcessingContent(status);
  return processingContent?.body ?? null;
};

const resolveFinalResultGuidance = (session: OrderSessionResponse) => {
  if (session.status === 'FAILED') {
    if (session.failureReason === 'OTP_EXCEEDED') {
      return 'OTP 시도 횟수를 초과했습니다. 주문을 다시 시작해 주세요.';
    }
    return '주문이 최종 실패했습니다. 실패 사유를 확인한 뒤 새 주문을 시작해 주세요.';
  }

  return resolveOrderFinalResultContent(session).body;
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

const ORDERABILITY_BOUNDARY_GUIDANCE =
  '보유 수량 또는 일일 매도 가능 한도를 확인한 뒤 수량을 조정해 주세요.';
const ORDERABILITY_BOUNDARY_FIELD_ERROR =
  '주문 수량이 현재 주문 가능 범위를 초과했습니다.';
const POSITION_QUANTITY_GUIDANCE =
  '보유 수량을 확인한 뒤 수량을 조정해 주세요.';
const POSITION_QUANTITY_FIELD_ERROR =
  '보유 수량을 다시 확인해 주세요.';
const DAILY_SELL_LIMIT_GUIDANCE =
  '일일 매도 가능 한도를 확인한 뒤 수량을 조정해 주세요.';
const DAILY_SELL_LIMIT_FIELD_ERROR =
  '일일 매도 가능 한도를 초과했습니다.';
const VALIDATION_GUIDANCE =
  '입력값을 확인한 뒤 다시 시도해 주세요.';

type OrderabilityBoundaryType =
  | 'insufficient-position'
  | 'daily-sell-limit'
  | 'generic-orderability';

const resolveOrderabilityBoundaryType = (
  normalized: {
    code?: string;
    operatorCode?: string;
    userMessageKey?: string;
  },
  code?: string,
): OrderabilityBoundaryType => {
  if (
    normalized.userMessageKey === 'error.order.insufficient_position'
    || normalized.operatorCode === 'INSUFFICIENT_POSITION'
    || code === 'ORD-003'
  ) {
    return 'insufficient-position';
  }

  if (
    normalized.userMessageKey === 'error.order.daily_sell_limit_exceeded'
    || normalized.operatorCode === 'DAILY_SELL_LIMIT_EXCEEDED'
    || code === 'ORD-002'
  ) {
    return 'daily-sell-limit';
  }

  return 'generic-orderability';
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
    operatorCode?: string;
    userMessageKey?: string;
  };
  const code = canonicalizeErrorCode(normalized.code);
  const message = normalized.message ?? '';

  if (code === 'ORD-006' || code === 'ORD-001') {
    return {
      fieldErrors: {},
      guidance: '매수 가능 금액을 확인하거나 수량을 조정한 뒤 다시 시도해 주세요.',
      inlineError: message || null,
    };
  }

  if (code === 'ORD-005' || code === 'ORD-002' || code === 'ORD-003') {
    const orderabilityType = resolveOrderabilityBoundaryType(normalized, code);
    const fieldError =
      orderabilityType === 'insufficient-position'
        ? POSITION_QUANTITY_FIELD_ERROR
        : orderabilityType === 'daily-sell-limit'
          ? DAILY_SELL_LIMIT_FIELD_ERROR
          : message || ORDERABILITY_BOUNDARY_FIELD_ERROR;
    const guidance =
      orderabilityType === 'insufficient-position'
        ? POSITION_QUANTITY_GUIDANCE
        : orderabilityType === 'daily-sell-limit'
          ? DAILY_SELL_LIMIT_GUIDANCE
          : ORDERABILITY_BOUNDARY_GUIDANCE;

    return {
      fieldErrors: {
        quantity: fieldError,
      },
      guidance,
      inlineError: null,
    };
  }

  if (code === 'VALIDATION-001' || code === 'VALIDATION-003') {
    return {
      fieldErrors: {},
      guidance: VALIDATION_GUIDANCE,
      inlineError: message || null,
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
  accountApi,
  isRefreshingSession,
  orderApi,
}: UseExternalOrderViewModelInput) => {
  const demoOrderOtpCodeRef = useRef(resolveDemoOrderOtpCode());
  const runtimeUrlOverrideRef = useRef(resolveRuntimeUrlOverride());
  const [selectedPresetId, setSelectedPresetId] = useState<ExternalOrderPresetId | null>(
    externalOrderPresetOptions[0].id,
  );
  const [draft, setDraft] = useState(createInitialExternalOrderDraft);
  const [flowState, dispatch] = useReducer(orderFlowReducer, initialOrderFlowState);
  const operationVersionRef = useRef(0);
  const {
    step,
    feedbackMessage,
    inlineError,
    errorReasonCategory,
    serverFieldErrors,
    presentation,
    orderSession,
    updatedPosition,
    updatedPositionMessage,
    hasDetectedSessionExpiry,
    otpValue,
    isCreating,
    isVerifyingOtp,
    isExecuting,
    isRestoring,
    isExtending,
  } = flowState;
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
    dispatch({
      type: 'clearTransientFeedback',
      preservePresentation: options?.preservePresentation,
    });
  };

  const invalidatePendingOperations = () => {
    operationVersionRef.current += 1;
  };

  const clearServerFieldErrors = (targets?: Array<keyof ExternalOrderFieldErrors>) => {
    dispatch({
      type: 'clearServerFieldErrors',
      targets,
    });
  };

  const reportStorageFailure = (error: unknown) => {
    dispatch({
      type: 'patch',
      payload: {
        errorReasonCategory: null,
        inlineError: getErrorMessage(error),
      },
    });
  };

  const clearUpdatedPositionState = () => {
    dispatch({
      type: 'patch',
      payload: {
        updatedPosition: null,
        updatedPositionMessage: null,
      },
    });
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
    dispatch({
      type: 'reset',
      inlineError: options?.message ?? null,
    });
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
    dispatch({
      type: 'discardDraftSessionContext',
    });
  };

  const goBackToDraft = () => {
    if (orderSession === null) {
      dispatch({
        type: 'patch',
        payload: {
          step: 'A',
        },
      });
      return;
    }

    invalidatePendingOperations();
    dispatch({
      type: 'goBackToDraft',
      feedbackMessage: resolveOrderAuthorizationGuidance(orderSession.authorizationReason),
    });
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
    dispatch({
      type: 'markSessionExpired',
      session: expiredSession,
    });
  };

  const applySessionState = (
    session: OrderSessionResponse,
    options?: { restoring?: boolean; preservePresentation?: boolean },
  ) => {
    setDraft({
      symbol: session.symbol,
      quantity: String(session.qty),
    });
    setSelectedPresetId(matchPresetIdFromDraft({
      symbol: session.symbol,
      quantity: String(session.qty),
    }));
    persistSessionContext(session.orderSessionId);

    if (session.status === 'AUTHED') {
      dispatch({
        type: 'syncSessionState',
        session,
        step: 'C',
        feedbackMessage: options?.restoring
          ? null
          : resolveOrderAuthorizationGuidance(session.authorizationReason),
        preservePresentation: options?.preservePresentation,
      });
      return;
    }

    if (session.status === 'PENDING_NEW' && session.challengeRequired) {
      dispatch({
        type: 'syncSessionState',
        session,
        step: 'B',
        feedbackMessage: null,
        preservePresentation: options?.preservePresentation,
      });
      return;
    }

    if (isPollingStatus(session.status)) {
      dispatch({
        type: 'syncSessionState',
        session,
        step: 'COMPLETE',
        feedbackMessage: resolveInFlightGuidance(session.status),
        preservePresentation: options?.preservePresentation,
      });
      return;
    }

    if (isFinalResultStatus(session.status)) {
      dispatch({
        type: 'syncSessionState',
        session,
        step: 'COMPLETE',
        feedbackMessage: resolveFinalResultGuidance(session),
        preservePresentation: options?.preservePresentation,
      });
      clearPersistedSessionContext();
      return;
    }

    if (isServerExpiredStatus(session.status)) {
      markSessionExpired(session);
      return;
    }

    dispatch({
      type: 'syncSessionState',
      session,
      step: 'A',
      feedbackMessage: null,
      preservePresentation: options?.preservePresentation,
    });
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

      dispatch({
        type: 'setBusyFlag',
        flag: 'isRestoring',
        value: true,
      });
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
          dispatch({
            type: 'setBusyFlag',
            flag: 'isRestoring',
            value: false,
          });
        }
      }
    };

    void restore();

    return () => {
      cancelled = true;
    };
  }, [accountId, isRefreshingSession, orderApi]);

  useEffect(() => {
    const completedOrderSession = orderSession;
    if (!completedOrderSession || !shouldLoadUpdatedPositionQuantity(completedOrderSession)) {
      dispatch({
        type: 'patch',
        payload: {
          updatedPosition: null,
          updatedPositionMessage: null,
        },
      });
      return;
    }

    const queryAccountId = accountId ?? String(completedOrderSession.accountId);
    if (!queryAccountId) {
      dispatch({
        type: 'patch',
        payload: {
          updatedPosition: null,
          updatedPositionMessage: null,
        },
      });
      return;
    }

    let cancelled = false;
    dispatch({
      type: 'patch',
      payload: {
        updatedPosition: null,
        updatedPositionMessage: '현재 보유 수량 확인 중...',
      },
    });

    const loadUpdatedPosition = async () => {
      try {
        const position = await accountApi.fetchAccountPosition({
          accountId: queryAccountId,
          symbol: completedOrderSession.symbol,
        });
        if (!cancelled) {
          dispatch({
            type: 'patch',
            payload: {
              updatedPosition: position,
              updatedPositionMessage: null,
            },
          });
        }
      } catch {
        if (!cancelled) {
          dispatch({
            type: 'patch',
            payload: {
              updatedPosition: null,
              updatedPositionMessage:
                '현재 보유 수량을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.',
            },
          });
        }
      }
    };

    void loadUpdatedPosition();

    return () => {
      cancelled = true;
    };
  }, [
    accountApi,
    accountId,
    orderSession,
  ]);

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

        dispatch({
          type: 'patch',
          payload: {
            inlineError: getErrorMessage(error),
          },
        });
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
    dispatch({
      type: 'setOtpValue',
      value: '',
    });

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

    dispatch({
      type: 'patch',
      payload: {
        errorReasonCategory: resolveOrderReasonCategory(code),
        inlineError: formatOtpError(error),
      },
    });
  };

  const verifyOtp = async (otpCode: string) => {
    if (!orderSession || isVerifyingOtp || otpCode.length !== 6) {
      return;
    }

    clearTransientFeedback();
    dispatch({
      type: 'setBusyFlag',
      flag: 'isVerifyingOtp',
      value: true,
    });
    const operationVersion = ++operationVersionRef.current;

    try {
      const session = await orderApi.verifyOrderSessionOtp(orderSession.orderSessionId, otpCode);
      if (operationVersion === operationVersionRef.current) {
        dispatch({
          type: 'setOtpValue',
          value: '',
        });
        applySessionState(session);
      }
    } catch (error) {
      if (operationVersion === operationVersionRef.current) {
        await handleOtpFailure(error, operationVersion);
      }
    } finally {
      if (operationVersion === operationVersionRef.current) {
        dispatch({
          type: 'setBusyFlag',
          flag: 'isVerifyingOtp',
          value: false,
        });
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
      dispatch({
        type: 'patch',
        payload: {
          inlineError: null,
          presentation: null,
          errorReasonCategory: null,
        },
      });
      return;
    }

    const request = buildExternalOrderRequest({
      accountId,
      symbol: draft.symbol,
      quantity: draft.quantity,
    });

    if (!request) {
      dispatch({
        type: 'patch',
        payload: {
          errorReasonCategory: null,
          inlineError: '주문에 사용할 계좌 정보를 확인할 수 없습니다.',
          presentation: null,
        },
      });
      return;
    }

    clearTransientFeedback();
    clearUpdatedPositionState();
    clearServerFieldErrors();
    dispatch({
      type: 'setBusyFlag',
      flag: 'isCreating',
      value: true,
    });
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
      const reasonCategory = resolveOrderReasonCategory(getErrorCode(error)) ?? 'validation';
      if (
        validationPresentation.fieldErrors.symbol
        || validationPresentation.fieldErrors.quantity
      ) {
        dispatch({
          type: 'patch',
          payload: {
            errorReasonCategory: reasonCategory,
            serverFieldErrors: validationPresentation.fieldErrors,
            inlineError: validationPresentation.inlineError,
            feedbackMessage:
              validationPresentation.guidance
              ?? buildServerValidationGuidance(validationPresentation.fieldErrors),
          },
        });
        return;
      }

      if (validationPresentation.guidance || validationPresentation.inlineError) {
        dispatch({
          type: 'patch',
          payload: {
            errorReasonCategory: reasonCategory,
            feedbackMessage: validationPresentation.guidance,
            inlineError: validationPresentation.inlineError,
          },
        });
        return;
      }

      dispatch({
        type: 'patch',
        payload: {
          errorReasonCategory: resolveOrderReasonCategory(getErrorCode(error)),
          inlineError: getErrorMessage(error),
        },
      });
    } finally {
      if (operationVersion === operationVersionRef.current) {
        dispatch({
          type: 'setBusyFlag',
          flag: 'isCreating',
          value: false,
        });
      }
    }
  };

  const execute = async () => {
    if (!orderSession || isExecuting) {
      return;
    }

    clearTransientFeedback();
    clearUpdatedPositionState();
    dispatch({
      type: 'setBusyFlag',
      flag: 'isExecuting',
      value: true,
    });
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
        const nextPresentation = resolveExternalOrderErrorPresentation(error);
        dispatch({
          type: 'patch',
          payload: {
            presentation: nextPresentation,
            errorReasonCategory: nextPresentation.reasonCategory,
          },
        });
        const handled = await refreshOrderSessionState(
          orderSession.orderSessionId,
          operationVersion,
          { preservePresentation: true },
        );
        if (handled) {
          return;
        }
      } else {
        dispatch({
          type: 'patch',
          payload: {
            errorReasonCategory: resolveOrderReasonCategory(getErrorCode(error)),
            inlineError: getErrorMessage(error),
          },
        });
      }
    } finally {
      if (operationVersion === operationVersionRef.current) {
        dispatch({
          type: 'setBusyFlag',
          flag: 'isExecuting',
          value: false,
        });
      }
    }
  };

  const extend = async () => {
    if (!orderSession || isExtending) {
      return;
    }

    clearTransientFeedback();
    dispatch({
      type: 'setBusyFlag',
      flag: 'isExtending',
      value: true,
    });
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
      dispatch({
        type: 'patch',
        payload: {
          errorReasonCategory: resolveOrderReasonCategory(getErrorCode(error)),
          inlineError: getErrorMessage(error),
        },
      });
    } finally {
      if (operationVersion === operationVersionRef.current) {
        dispatch({
          type: 'setBusyFlag',
          flag: 'isExtending',
          value: false,
        });
      }
    }
  };

  return {
    authorizationReasonMessage:
      orderSession ? resolveOrderAuthorizationGuidance(orderSession.authorizationReason) : null,
    clear: clearTransientFeedback,
    extend,
    execute,
    errorReasonCategoryLabel: getOrderReasonCategoryLabel(errorReasonCategory),
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
    updatedPositionQuantity: updatedPosition?.quantity ?? null,
    updatedPositionQuantityMessage: updatedPositionMessage,
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
      dispatch({
        type: 'patch',
        payload: {
          otpValue: digitsOnly,
          inlineError: null,
        },
      });
      if (step === 'B' && digitsOnly.length === 6) {
        void verifyOtp(digitsOnly);
      }
    },
    step,
    submit,
  };
};
