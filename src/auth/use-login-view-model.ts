import { useState } from 'react';

import { getLoginErrorFeedback } from './auth-errors';
import { validateLoginForm } from './form-validation';
import type { AuthMutationResult } from './mobile-auth-service';
import type { LoginRequest } from '../types/auth';
import {
  createEmptyLoginFeedback,
  type LoginField,
  type LoginFormFeedback,
} from '../types/auth-ui';

interface LoginViewModelInput {
  submit: (payload: LoginRequest) => Promise<AuthMutationResult>;
}

export const useLoginViewModel = ({ submit }: LoginViewModelInput) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] =
    useState<LoginFormFeedback>(createEmptyLoginFeedback);

  const clearField = (field: LoginField) => {
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

  const updateUsername = (value: string) => {
    clearField('username');
    setUsername(value);
  };

  const updatePassword = (value: string) => {
    clearField('password');
    setPassword(value);
  };

  const submitLogin = async () => {
    if (isSubmitting) {
      return;
    }

    const validation = validateLoginForm({
      username,
      password,
    });

    if (!validation.valid) {
      setFeedback(validation.feedback);
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submit(validation.payload);

      setFeedback(
        result.success
          ? validation.feedback
          : getLoginErrorFeedback(result.error),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    username,
    password,
    showPassword,
    isSubmitting,
    feedback,
    updateUsername,
    updatePassword,
    togglePasswordVisibility: () => {
      setShowPassword((current) => !current);
    },
    submitLogin,
  };
};
