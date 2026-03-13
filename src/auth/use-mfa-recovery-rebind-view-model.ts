import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { resolveMfaErrorPresentation } from './auth-errors';
import type { RestartMfaRecoveryOptions } from './auth-flow-view-model';
import { isCompleteOtpCode, sanitizeOtpCodeInput } from './totp-code';
import type {
  MfaRecoveryRebindConfirmRequest,
  TotpRebindBootstrap,
} from '../types/auth';
import type { MfaRecoveryRebindConfirmationResult } from '../types/auth-ui';

interface MfaRecoveryRebindViewModelInput {
  bootstrap: TotpRebindBootstrap;
  restartRecovery: (options?: RestartMfaRecoveryOptions) => void;
  submit: (
    payload: MfaRecoveryRebindConfirmRequest,
  ) => Promise<MfaRecoveryRebindConfirmationResult>;
}

export const useMfaRecoveryRebindViewModel = ({
  bootstrap,
  restartRecovery,
  submit,
}: MfaRecoveryRebindViewModelInput) => {
  const [otpCode, setOtpCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isMountedRef = useRef(true);
  const submitRequestIdRef = useRef(0);

  useEffect(() => () => {
    isMountedRef.current = false;
    submitRequestIdRef.current += 1;
  }, []);

  const submitRecoveryConfirmation = async () => {
    if (isSubmitting) {
      return;
    }

    const normalizedOtp = sanitizeOtpCodeInput(otpCode);

    if (!isCompleteOtpCode(normalizedOtp)) {
      setErrorMessage('현재 인증 코드는 숫자 6자리로 입력해 주세요.');
      return;
    }

    const requestId = submitRequestIdRef.current + 1;
    submitRequestIdRef.current = requestId;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await submit({
        rebindToken: bootstrap.rebindToken,
        enrollmentToken: bootstrap.enrollmentToken,
        otpCode: normalizedOtp,
      });

      if (!isMountedRef.current || submitRequestIdRef.current !== requestId) {
        return;
      }

      if (!result.success) {
        const presentation = resolveMfaErrorPresentation(result.error);

        if (presentation.code === 'AUTH-019' || presentation.code === 'AUTH-020') {
          if (!isMountedRef.current) {
            return;
          }
          restartRecovery({
            bannerMessage: presentation.message,
            bannerTone: 'error',
          });
          return;
        }

        setErrorMessage(presentation.message);
      }
    } catch (error) {
      if (!isMountedRef.current || submitRequestIdRef.current !== requestId) {
        return;
      }

      const presentation = resolveMfaErrorPresentation(error);

      if (presentation.code === 'AUTH-019' || presentation.code === 'AUTH-020') {
        if (!isMountedRef.current) {
          return;
        }
        restartRecovery({
          bannerMessage: presentation.message,
          bannerTone: 'error',
        });
        return;
      }

      setErrorMessage(presentation.message);
    } finally {
      if (isMountedRef.current && submitRequestIdRef.current === requestId) {
        setIsSubmitting(false);
      }
    }
  };

  const openAuthenticator = async () => {
    setErrorMessage(null);

    try {
      await Linking.openURL(bootstrap.qrUri);
    } catch {
      if (isMountedRef.current) {
        setErrorMessage('인증 앱을 열지 못했습니다. 아래 수동 입력 키를 사용해 직접 등록해 주세요.');
      }
    }
  };

  return {
    otpCode,
    errorMessage,
    isSubmitting,
    updateOtpCode: (value: string) => {
      const normalized = sanitizeOtpCodeInput(value);
      setErrorMessage(null);
      setOtpCode(normalized);
    },
    openAuthenticator,
    submitRecoveryConfirmation,
  };
};
