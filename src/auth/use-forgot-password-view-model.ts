import { useState } from 'react';

import {
  getForgotPasswordErrorFeedback,
} from './auth-errors';
import { validateForgotPasswordForm } from './form-validation';
import type {
  PasswordForgotRequest,
  PasswordRecoveryChallengeResponse,
} from '../types/auth';
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

export const useForgotPasswordViewModel = ({
  submit,
  submitChallenge,
}: ForgotPasswordViewModelInput) => {
  const [email, setEmail] = useState('');
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [challengeState, setChallengeState] =
    useState<PasswordRecoveryChallengeResponse | null>(null);
  const [acceptedMessage, setAcceptedMessage] = useState<string | null>(null);
  const [challengeMayBeRequired, setChallengeMayBeRequired] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBootstrappingChallenge, setIsBootstrappingChallenge] = useState(false);
  const [feedback, setFeedback] =
    useState<ForgotPasswordFormFeedback>(createEmptyForgotPasswordFeedback);

  const resetFlowState = () => {
    setChallengeAnswer('');
    setChallengeState(null);
    setAcceptedMessage(null);
    setChallengeMayBeRequired(false);
  };

  const clearStaleChallengeState = () => {
    setChallengeAnswer('');
    setChallengeState(null);
    setAcceptedMessage(null);
    setChallengeMayBeRequired(false);
  };

  const updateEmail = (value: string) => {
    setEmail(value);
    resetFlowState();
    setFeedback(createEmptyForgotPasswordFeedback());
  };

  const submitForgotPassword = async () => {
    if (isSubmitting) {
      return;
    }

    const validation = validateForgotPasswordForm({
      email,
      challengeAnswer,
      challengeToken: challengeState?.challengeToken,
    });

    if (!validation.valid) {
      setFeedback(validation.feedback);
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submit(validation.payload);

      if (!result.success) {
        if (challengeState) {
          clearStaleChallengeState();
        } else {
          setAcceptedMessage(null);
        }

        setFeedback(getForgotPasswordErrorFeedback(result.error));
        return;
      }

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
        email: validation.payload.email,
      });

      if (!result.success) {
        setFeedback(getForgotPasswordErrorFeedback(result.error));
        return;
      }

      setFeedback(createEmptyForgotPasswordFeedback());
      setChallengeMayBeRequired(true);
      setChallengeState(result.challenge);
    } finally {
      setIsBootstrappingChallenge(false);
    }
  };

  return {
    email,
    challengeAnswer,
    challengeState,
    acceptedMessage,
    challengeMayBeRequired,
    isSubmitting,
    isBootstrappingChallenge,
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
  };
};
