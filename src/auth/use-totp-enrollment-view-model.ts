import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { resolveMfaErrorPresentation } from './auth-errors';
import { isCompleteOtpCode, sanitizeOtpCodeInput } from './totp-code';
import type {
  LoginChallenge,
  TotpEnrollmentBootstrap,
  TotpEnrollmentConfirmationRequest,
} from '../types/auth';
import type {
  FormSubmissionResult,
  TotpEnrollmentBootstrapResult,
} from '../types/auth-ui';

interface UseTotpEnrollmentViewModelInput {
  challenge: LoginChallenge;
  loadEnrollment: () => Promise<TotpEnrollmentBootstrapResult>;
  submit: (
    payload: TotpEnrollmentConfirmationRequest,
  ) => Promise<FormSubmissionResult>;
  openUrl?: (url: string) => Promise<unknown>;
}

export const useTotpEnrollmentViewModel = ({
  challenge,
  loadEnrollment,
  submit,
  openUrl = Linking.openURL,
}: UseTotpEnrollmentViewModelInput) => {
  const [bootstrap, setBootstrap] = useState<TotpEnrollmentBootstrap | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingBootstrap, setIsLoadingBootstrap] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shouldLoadBootstrap, setShouldLoadBootstrap] = useState(true);
  const bootstrapRequestIdRef = useRef(0);
  const previousChallengeTokenRef = useRef(challenge.loginToken);

  useEffect(() => {
    if (bootstrap || isLoadingBootstrap || !shouldLoadBootstrap) {
      return;
    }

    const requestId = bootstrapRequestIdRef.current + 1;
    bootstrapRequestIdRef.current = requestId;
    setShouldLoadBootstrap(false);
    setIsLoadingBootstrap(true);
    setErrorMessage(null);

    void loadEnrollment()
      .then((result) => {
        if (bootstrapRequestIdRef.current !== requestId) {
          return;
        }

        if (result.success) {
          setBootstrap(result.enrollment);
          return;
        }

        setErrorMessage(resolveMfaErrorPresentation(result.error).message);
      })
      .catch((error) => {
        if (bootstrapRequestIdRef.current !== requestId) {
          return;
        }

        setErrorMessage(resolveMfaErrorPresentation(error).message);
      })
      .finally(() => {
        if (bootstrapRequestIdRef.current === requestId) {
          setIsLoadingBootstrap(false);
        }
      });
  }, [bootstrap, isLoadingBootstrap, loadEnrollment, shouldLoadBootstrap]);

  useEffect(() => {
    if (previousChallengeTokenRef.current === challenge.loginToken) {
      return;
    }

    previousChallengeTokenRef.current = challenge.loginToken;
    bootstrapRequestIdRef.current += 1;
    setBootstrap(null);
    setOtpCode('');
    setErrorMessage(null);
    setIsLoadingBootstrap(false);
    setShouldLoadBootstrap(true);
  }, [challenge.loginToken]);

  const updateOtpCode = (value: string) => {
    setErrorMessage(null);
    setOtpCode(sanitizeOtpCodeInput(value));
  };

  const retryBootstrap = () => {
    setShouldLoadBootstrap(true);
  };

  const submitEnrollment = async () => {
    if (isSubmitting) {
      return;
    }

    if (!bootstrap) {
      setErrorMessage('인증 앱 등록 정보를 다시 불러와 주세요.');
      return;
    }

    const normalizedOtp = sanitizeOtpCodeInput(otpCode);

    if (!isCompleteOtpCode(normalizedOtp)) {
      setErrorMessage('첫 인증 코드는 숫자 6자리로 입력해 주세요.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await submit({
        loginToken: challenge.loginToken,
        enrollmentToken: bootstrap.enrollmentToken,
        otpCode: normalizedOtp,
      });

      if (!result.success) {
        setErrorMessage(resolveMfaErrorPresentation(result.error).message);
      }
    } catch (error) {
      setErrorMessage(resolveMfaErrorPresentation(error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openAuthenticator = async () => {
    if (!bootstrap?.qrUri) {
      return;
    }

    setErrorMessage(null);

    try {
      await openUrl(bootstrap.qrUri);
    } catch {
      setErrorMessage('인증 앱을 열지 못했습니다. 아래 수동 입력 키를 사용해 직접 등록해 주세요.');
    }
  };

  return {
    bootstrap,
    otpCode,
    errorMessage,
    isLoadingBootstrap,
    isSubmitting,
    retryBootstrap,
    updateOtpCode,
    submitEnrollment,
    openAuthenticator,
  };
};
