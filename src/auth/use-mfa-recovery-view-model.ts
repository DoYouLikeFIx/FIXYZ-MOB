import { useEffect, useRef, useState } from 'react';

import { resolveMfaErrorPresentation } from './auth-errors';
import type {
  MfaRecoveryState,
  RestartMfaRecoveryOptions,
} from './auth-flow-view-model';
import type { AuthStatus } from '../store/auth-store';
import type { Member, MemberTotpRebindRequest } from '../types/auth';
import type { TotpRebindBootstrapResult } from '../types/auth-ui';

interface MfaRecoveryViewModelInput {
  authStatus: AuthStatus;
  member: Member | null;
  mfaRecovery: MfaRecoveryState | null;
  bootstrapAuthenticated: (
    payload: MemberTotpRebindRequest,
  ) => Promise<TotpRebindBootstrapResult>;
  bootstrapRecovery: () => Promise<TotpRebindBootstrapResult>;
  restartRecovery: (options?: RestartMfaRecoveryOptions) => void;
  restartEnrollmentLogin: (message: string) => void;
}

export const useMfaRecoveryViewModel = ({
  authStatus,
  member,
  mfaRecovery,
  bootstrapAuthenticated,
  bootstrapRecovery,
  restartRecovery,
  restartEnrollmentLogin,
}: MfaRecoveryViewModelInput) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasAttemptedProofBootstrap, setHasAttemptedProofBootstrap] = useState(false);
  const isMountedRef = useRef(true);
  const proofBootstrapRequestIdRef = useRef(0);
  const authenticatedSubmitRequestIdRef = useRef(0);
  const suggestedEmail = mfaRecovery?.suggestedEmail?.trim() ?? '';
  const hasRecoveryProof = Boolean(mfaRecovery?.recoveryProof);
  const isAuthenticatedEntry = authStatus === 'authenticated' && Boolean(member);
  const shouldShowPasswordEntry = isAuthenticatedEntry && !hasRecoveryProof;

  useEffect(() => () => {
    isMountedRef.current = false;
    proofBootstrapRequestIdRef.current += 1;
    authenticatedSubmitRequestIdRef.current += 1;
  }, []);

  useEffect(() => {
    setHasAttemptedProofBootstrap(false);
    if (mfaRecovery?.recoveryProof) {
      setErrorMessage(null);
    }
  }, [mfaRecovery?.recoveryProof]);

  useEffect(() => {
    if (!hasRecoveryProof || isAuthenticatedEntry || mfaRecovery?.bootstrap || isSubmitting || hasAttemptedProofBootstrap) {
      return;
    }

    const requestId = proofBootstrapRequestIdRef.current + 1;
    proofBootstrapRequestIdRef.current = requestId;
    setHasAttemptedProofBootstrap(true);
    setIsSubmitting(true);
    setErrorMessage(null);

    void bootstrapRecovery()
      .then((result) => {
        if (
          !isMountedRef.current
          || proofBootstrapRequestIdRef.current !== requestId
          || result.success
        ) {
          return;
        }

        const presentation = resolveMfaErrorPresentation(result.error);

        if (presentation.code === 'AUTH-019' || presentation.code === 'AUTH-020') {
          if (!isMountedRef.current) {
            return;
          }
          restartRecovery();
          return;
        }

        setErrorMessage(presentation.message);
      })
      .catch((error) => {
        if (!isMountedRef.current || proofBootstrapRequestIdRef.current !== requestId) {
          return;
        }

        const presentation = resolveMfaErrorPresentation(error);

        if (presentation.code === 'AUTH-019' || presentation.code === 'AUTH-020') {
          if (!isMountedRef.current) {
            return;
          }
          restartRecovery();
          return;
        }

        setErrorMessage(presentation.message);
      })
      .finally(() => {
        if (isMountedRef.current && proofBootstrapRequestIdRef.current === requestId) {
          setIsSubmitting(false);
        }
      });
  }, [
    bootstrapRecovery,
    hasAttemptedProofBootstrap,
    hasRecoveryProof,
    isAuthenticatedEntry,
    isSubmitting,
    mfaRecovery?.bootstrap,
    restartRecovery,
  ]);

  const submitAuthenticatedRecovery = async () => {
    if (isSubmitting || !isAuthenticatedEntry) {
      return;
    }

    const normalizedPassword = currentPassword.trim();

    if (!normalizedPassword) {
      setErrorMessage('현재 비밀번호를 입력해 주세요.');
      return;
    }

    const requestId = authenticatedSubmitRequestIdRef.current + 1;
    authenticatedSubmitRequestIdRef.current = requestId;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await bootstrapAuthenticated({
        currentPassword,
      });

      if (!isMountedRef.current || authenticatedSubmitRequestIdRef.current !== requestId) {
        return;
      }

      if (!result.success) {
        const presentation = resolveMfaErrorPresentation(result.error);

        if (presentation.navigateToEnroll) {
          restartEnrollmentLogin('Google Authenticator 등록이 필요합니다. 다시 로그인하면 인증 앱 등록 단계로 이동합니다.');
          return;
        }

        setErrorMessage(presentation.message);
      }
    } catch (error) {
      if (!isMountedRef.current || authenticatedSubmitRequestIdRef.current !== requestId) {
        return;
      }
      const presentation = resolveMfaErrorPresentation(error);

      if (presentation.navigateToEnroll) {
        restartEnrollmentLogin('Google Authenticator 등록이 필요합니다. 다시 로그인하면 인증 앱 등록 단계로 이동합니다.');
        return;
      }

      setErrorMessage(presentation.message);
    } finally {
      if (isMountedRef.current && authenticatedSubmitRequestIdRef.current === requestId) {
        setIsSubmitting(false);
      }
    }
  };

  return {
    currentPassword,
    errorMessage,
    isSubmitting,
    suggestedEmail,
    hasRecoveryProof,
    isAuthenticatedEntry,
    shouldShowPasswordEntry,
    updateCurrentPassword: (value: string) => {
      setCurrentPassword(value);
      setErrorMessage(null);
    },
    retryProofBootstrap: () => {
      setHasAttemptedProofBootstrap(false);
      setErrorMessage(null);
    },
    submitAuthenticatedRecovery,
  };
};
