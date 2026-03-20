import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { resolveAuthErrorPresentation } from './auth-errors';
import {
  getRecoveryChallengeFailClosedMessage,
  isPasswordRecoveryChallengeTrustedForSolve,
  isPasswordRecoveryProofOfWorkChallenge,
  parsePasswordRecoveryChallengeResponse,
  reportPasswordRecoveryChallengeFailClosed,
  solvePasswordRecoveryProofOfWork,
  type PasswordRecoveryChallengeSession,
  type RecoveryChallengeFailClosedReason,
} from './recovery-challenge';
import { validateForgotPasswordForm } from './form-validation';
import type { PasswordForgotRequest } from '../types/auth';
import {
  type PasswordForgotResult,
  type PasswordRecoveryChallengeResult,
  createEmptyForgotPasswordFeedback,
  type ForgotPasswordFormFeedback,
} from '../types/auth-ui';

interface ForgotPasswordViewModelInput {
  submit: (payload: PasswordForgotRequest) => Promise<PasswordForgotResult>;
  submitChallenge: (payload: {
    email: string;
  }) => Promise<PasswordRecoveryChallengeResult>;
}

type ChallengeSolveStatus = 'idle' | 'solving' | 'solved' | 'failed';

export const useForgotPasswordViewModel = ({
  submit,
  submitChallenge,
}: ForgotPasswordViewModelInput) => {
  const [email, setEmail] = useState('');
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [challengeState, setChallengeState] =
    useState<PasswordRecoveryChallengeSession | null>(null);
  const [acceptedMessage, setAcceptedMessage] = useState<string | null>(null);
  const [challengeMayBeRequired, setChallengeMayBeRequired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBootstrappingChallenge, setIsBootstrappingChallenge] = useState(false);
  const [challengeSolveStatus, setChallengeSolveStatus] =
    useState<ChallengeSolveStatus>('idle');
  const [challengeSolveProgress, setChallengeSolveProgress] = useState(0);
  const [challengeFailClosedReason, setChallengeFailClosedReason] =
    useState<RecoveryChallengeFailClosedReason | null>(null);
  const [feedback, setFeedback] =
    useState<ForgotPasswordFormFeedback>(createEmptyForgotPasswordFeedback);
  const activeChallengeIdRef = useRef<string | null>(null);

  const clearChallengeRuntimeState = () => {
    activeChallengeIdRef.current = null;
    setChallengeAnswer('');
    setChallengeSolveStatus('idle');
    setChallengeSolveProgress(0);
    setChallengeFailClosedReason(null);
  };

  const clearChallengeState = () => {
    setChallengeState(null);
    clearChallengeRuntimeState();
  };

  const resetFlowState = () => {
    clearChallengeState();
    setAcceptedMessage(null);
    setChallengeMayBeRequired(false);
  };

  const updateFeedbackForChallengeFailure = (
    reason: RecoveryChallengeFailClosedReason,
  ) => {
    reportPasswordRecoveryChallengeFailClosed(reason);
    setChallengeMayBeRequired(true);
    setChallengeFailClosedReason(reason);
    setFeedback((current) => ({
      ...current,
      globalMessage: getRecoveryChallengeFailClosedMessage(reason),
    }));
  };

  const acceptBootstrappedChallenge = (nextChallenge: PasswordRecoveryChallengeSession) => {
    const currentChallenge = challengeState;
    if (currentChallenge?.kind === 'proof-of-work' && nextChallenge.kind === 'proof-of-work') {
      if (
        nextChallenge.challengeId === currentChallenge.challengeId
        && nextChallenge.challengeIssuedAtEpochMs === currentChallenge.challengeIssuedAtEpochMs
      ) {
        return;
      }

      if (nextChallenge.challengeIssuedAtEpochMs < currentChallenge.challengeIssuedAtEpochMs) {
        return;
      }

      if (
        nextChallenge.challengeIssuedAtEpochMs === currentChallenge.challengeIssuedAtEpochMs
        && nextChallenge.challengeId !== currentChallenge.challengeId
      ) {
        clearChallengeState();
        updateFeedbackForChallengeFailure('validity-untrusted');
        return;
      }
    }

    if (nextChallenge.kind === 'proof-of-work' && !isPasswordRecoveryChallengeTrustedForSolve(nextChallenge)) {
      clearChallengeState();
      updateFeedbackForChallengeFailure('validity-untrusted');
      return;
    }

    activeChallengeIdRef.current =
      nextChallenge.kind === 'proof-of-work' ? nextChallenge.challengeId : null;
    setChallengeState(nextChallenge);
    setChallengeAnswer('');
    setChallengeSolveProgress(0);
    setChallengeSolveStatus(nextChallenge.kind === 'proof-of-work' ? 'solving' : 'idle');
    setChallengeFailClosedReason(null);
    setFeedback(createEmptyForgotPasswordFeedback());
    setChallengeMayBeRequired(true);
  };

  const updateEmail = (value: string) => {
    setEmail(value);
    resetFlowState();
    setFeedback(createEmptyForgotPasswordFeedback());
  };

  const submitForgotPassword = async (overrideChallengeAnswer?: string) => {
    if (isSubmitting) {
      return;
    }

    const submittedEmail = challengeState?.email ?? email;
    const effectiveChallengeAnswer =
      overrideChallengeAnswer ?? challengeAnswer;

    const validation = validateForgotPasswordForm({
      email: submittedEmail,
      challengeAnswer: challengeState ? effectiveChallengeAnswer : undefined,
      challengeToken: challengeState?.challengeToken,
    });

    if (!validation.valid) {
      setFeedback(validation.feedback);
      return;
    }

    if (
      isPasswordRecoveryProofOfWorkChallenge(challengeState)
      && challengeSolveStatus !== 'solved'
      && !overrideChallengeAnswer
    ) {
      setFeedback((current) => ({
        ...current,
        globalMessage: '보안 확인을 계산 중입니다. 잠시만 기다려 주세요.',
      }));
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submit({
        email: submittedEmail,
        challengeToken: challengeState?.challengeToken,
        challengeAnswer: challengeState ? effectiveChallengeAnswer : undefined,
      });

      if (!result.success) {
        const presentation = resolveAuthErrorPresentation(result.error);
        const challengeCode = presentation.code;

        if (
          challengeCode === 'AUTH-022'
          || challengeCode === 'AUTH-024'
          || challengeCode === 'AUTH-025'
        ) {
          clearChallengeState();
          setAcceptedMessage(null);
          setChallengeMayBeRequired(true);
        } else if (challengeState) {
          clearChallengeState();
          setAcceptedMessage(null);
        } else {
          setAcceptedMessage(null);
        }

        setFeedback((current) => ({
          ...current,
          globalMessage: presentation.message,
        }));
        return;
      }

      clearChallengeState();
      setFeedback(validation.feedback);
      setAcceptedMessage(result.response.message);
      setChallengeMayBeRequired(result.response.recovery.challengeMayBeRequired);
    } finally {
      setIsSubmitting(false);
    }
  };

  const bootstrapChallenge = async () => {
    if (isSubmitting || isBootstrappingChallenge) {
      return;
    }

    const validation = validateForgotPasswordForm({
      email,
    });

    if (!validation.valid) {
      setFeedback(validation.feedback);
      return;
    }

    setIsBootstrappingChallenge(true);

    try {
      const result = await submitChallenge({
        email,
      });

      if (!result.success) {
        const presentation = resolveAuthErrorPresentation(result.error);
        if (challengeState) {
          clearChallengeState();
        }

        setFeedback((current) => ({
          ...current,
          globalMessage: presentation.message,
        }));
        return;
      }

      const parsed = parsePasswordRecoveryChallengeResponse(
        result.challenge,
        email,
      );

      if ('error' in parsed) {
        clearChallengeState();
        updateFeedbackForChallengeFailure(parsed.error.reason);
        return;
      }

      acceptBootstrappedChallenge(parsed.challenge);
    } finally {
      setIsBootstrappingChallenge(false);
    }
  };

  const cancelChallenge = (reason?: RecoveryChallengeFailClosedReason) => {
    clearChallengeState();

    if (reason) {
      updateFeedbackForChallengeFailure(reason);
    }
  };

  useEffect(() => {
    if (!isPasswordRecoveryProofOfWorkChallenge(challengeState)) {
      return undefined;
    }

    const challengeId = challengeState.challengeId;
    let cancelled = false;

    setChallengeSolveStatus('solving');
    setChallengeSolveProgress(0);
    setChallengeAnswer('');

    void solvePasswordRecoveryProofOfWork(challengeState.challengePayload.proofOfWork, {
      onProgress: (progress) => {
        if (cancelled || activeChallengeIdRef.current !== challengeId) {
          return;
        }

        setChallengeSolveProgress(progress);
      },
      shouldAbort: () => cancelled || activeChallengeIdRef.current !== challengeId,
    })
      .then((nonce) => {
        if (cancelled || activeChallengeIdRef.current !== challengeId) {
          return;
        }

        setChallengeAnswer(nonce);
        setChallengeSolveProgress(100);
        setChallengeSolveStatus('solved');
      })
      .catch((error: unknown) => {
        if (cancelled || activeChallengeIdRef.current !== challengeId) {
          return;
        }

        if (error instanceof Error && error.message === 'recovery-challenge-solve-aborted') {
          return;
        }

        clearChallengeState();
        updateFeedbackForChallengeFailure('validity-untrusted');
      });

    return () => {
      cancelled = true;
    };
  }, [challengeState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' && isPasswordRecoveryProofOfWorkChallenge(challengeState)) {
        clearChallengeState();
        updateFeedbackForChallengeFailure('validity-untrusted');
      }
    });

    return () => {
      subscription.remove();
    };
  }, [challengeState]);

  return {
    email,
    challengeAnswer,
    challengeState,
    acceptedMessage,
    challengeMayBeRequired,
    isSubmitting,
    isBootstrappingChallenge,
    challengeSolveStatus,
    challengeSolveProgress,
    challengeFailClosedReason,
    feedback,
    updateEmail,
    updateChallengeAnswer: (value: string) => {
      setChallengeAnswer(value);
      setFeedback((current) => ({
        ...current,
        globalMessage: null,
        fieldErrors: {
          ...current.fieldErrors,
          challengeAnswer: false,
        },
        fieldMessages: {
          ...current.fieldMessages,
          challengeAnswer: undefined,
        },
      }));
    },
    submitForgotPassword,
    bootstrapChallenge,
    cancelChallenge,
  };
};
