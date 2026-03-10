import { useEffect, useState } from 'react';

import { getResetPasswordErrorFeedback, isReauthError } from './auth-errors';
import {
  getResetPasswordState,
  validateResetPasswordForm,
} from './form-validation';
import {
  type PasswordResetResult,
  createEmptyResetPasswordFeedback,
  type ResetPasswordFormFeedback,
} from '../types/auth-ui';

interface ResetPasswordViewModelInput {
  initialToken?: string;
  submit: (payload: {
    token: string;
    newPassword: string;
  }) => Promise<PasswordResetResult>;
}

export const useResetPasswordViewModel = ({
  initialToken,
  submit,
}: ResetPasswordViewModelInput) => {
  const [token, setToken] = useState(initialToken ?? '');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] =
    useState<ResetPasswordFormFeedback>(createEmptyResetPasswordFeedback);
  const passwordState = getResetPasswordState(newPassword);

  useEffect(() => {
    if (!initialToken) {
      return;
    }

    setToken(initialToken);
    setFeedback((current) => ({
      ...current,
      globalMessage: null,
      fieldErrors: {
        ...current.fieldErrors,
        token: false,
      },
      fieldMessages: {
        ...current.fieldMessages,
        token: undefined,
      },
    }));
  }, [initialToken]);

  const clearField = (field: 'token' | 'newPassword') => {
    setFeedback((current) => ({
      ...current,
      globalMessage: null,
      fieldErrors: {
        ...current.fieldErrors,
        [field]: false,
      },
      fieldMessages: {
        ...current.fieldMessages,
        [field]: undefined,
      },
    }));
  };

  const submitResetPassword = async () => {
    if (isSubmitting) {
      return;
    }

    const validation = validateResetPasswordForm({
      token,
      newPassword,
    });

    if (!validation.valid) {
      setFeedback(validation.feedback);
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submit(validation.payload);

      if (!result.success) {
        if (isReauthError(result.error)) {
          return;
        }

        setFeedback(getResetPasswordErrorFeedback(result.error));
        return;
      }

      setFeedback(validation.feedback);
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    token,
    newPassword,
    showPassword,
    isSubmitting,
    feedback,
    passwordState,
    updateToken: (value: string) => {
      setToken(value);
      clearField('token');
    },
    updateNewPassword: (value: string) => {
      setNewPassword(value);
      clearField('newPassword');
    },
    togglePasswordVisibility: () => {
      setShowPassword((current) => !current);
    },
    submitResetPassword,
  };
};
