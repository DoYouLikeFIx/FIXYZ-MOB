import { useState } from 'react';

import { getLoginErrorFeedback } from './auth-errors';
import { validateLoginForm } from './form-validation';
import type { LoginRequest } from '../types/auth';
import {
  type AuthMutationResult,
  createEmptyLoginFeedback,
  type LoginField,
  type LoginFormFeedback,
} from '../types/auth-ui';

interface LoginViewModelInput {
  submit: (payload: LoginRequest) => Promise<AuthMutationResult>;
}

export const useLoginViewModel = ({ submit }: LoginViewModelInput) => {
  const [email, setEmail] = useState('');
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

  const updateEmail = (value: string) => {
    clearField('email');
    setEmail(value);
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
      email,
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
    email,
    password,
    showPassword,
    isSubmitting,
    feedback,
    updateEmail,
    updatePassword,
    togglePasswordVisibility: () => {
      setShowPassword((current) => !current);
    },
    submitLogin,
  };
};
