import { DEFAULT_SERVER_ERROR_MESSAGE } from '../network/errors';
import type { NormalizedHttpError } from '../network/types';

export const ACCOUNT_DASHBOARD_RETRY_GUIDANCE =
  '잠시 후 다시 시도해 주세요. 문제가 계속되면 고객센터에 문의해 주세요.';

export interface AccountDashboardErrorPresentation {
  message: string;
  nextStep: string;
}

export const getAccountDashboardErrorPresentation = (
  error: unknown,
): AccountDashboardErrorPresentation => {
  const message =
    typeof error === 'object'
    && error !== null
    && 'message' in error
    && typeof (error as Partial<NormalizedHttpError>).message === 'string'
      ? (error as NormalizedHttpError).message
      : DEFAULT_SERVER_ERROR_MESSAGE;

  return {
    message,
    nextStep: ACCOUNT_DASHBOARD_RETRY_GUIDANCE,
  };
};
