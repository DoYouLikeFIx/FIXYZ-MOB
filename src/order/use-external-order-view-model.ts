import { useState } from 'react';

import type { OrderApi } from '../api/order-api';
import {
  buildExternalOrderRequest,
  externalOrderPresetOptions,
  type ExternalOrderPresetId,
} from './external-order-recovery';
import {
  isVisibleExternalOrderError,
  resolveExternalOrderErrorPresentation,
  type ExternalOrderErrorPresentation,
} from './external-errors';

interface UseExternalOrderViewModelInput {
  accountId?: string;
  orderApi: OrderApi;
}

export const useExternalOrderViewModel = ({
  accountId,
  orderApi,
}: UseExternalOrderViewModelInput) => {
  const [selectedPresetId, setSelectedPresetId] = useState<ExternalOrderPresetId>(
    externalOrderPresetOptions[0].id,
  );
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [presentation, setPresentation] =
    useState<ExternalOrderErrorPresentation | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    if (isSubmitting) {
      return;
    }

    const request = buildExternalOrderRequest({
      accountId,
      presetId: selectedPresetId,
    });

    if (!request) {
      setFeedbackMessage('주문에 사용할 계좌 정보를 확인할 수 없습니다.');
      setPresentation(null);
      return;
    }

    setIsSubmitting(true);
    setFeedbackMessage(null);
    setPresentation(null);

    try {
      const result = await orderApi.submitOrder(request);
      setFeedbackMessage(`주문 요청이 접수되었습니다. 상태: ${result.status}`);
      setPresentation(null);
    } catch (error) {
      if (isVisibleExternalOrderError(error)) {
        setPresentation(resolveExternalOrderErrorPresentation(error));
        setFeedbackMessage(null);
      } else {
        setFeedbackMessage(
          error instanceof Error ? error.message : '주문 요청 처리 중 문제가 발생했습니다.',
        );
        setPresentation(null);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    feedbackMessage,
    isSubmitting,
    presentation,
    presets: externalOrderPresetOptions,
    selectedPresetId,
    clear: () => {
      setFeedbackMessage(null);
      setPresentation(null);
    },
    selectPreset: (presetId: ExternalOrderPresetId) => {
      setSelectedPresetId(presetId);
      setFeedbackMessage(null);
      setPresentation(null);
    },
    submit,
  };
};
