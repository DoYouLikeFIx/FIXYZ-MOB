import { useState } from 'react';

import { getRegisterErrorFeedback } from './auth-errors';
import {
  getConfirmPasswordState,
  getPasswordPolicyState,
  getRegisterKeyboardMessage,
  validateRegisterForm,
  validateRegisterField,
} from './form-validation';
import type { RegisterRequest } from '../types/auth';
import {
  type AuthMutationResult,
  createEmptyRegisterFeedback,
  type RegisterField,
  type RegisterFormFeedback,
  type RegisterFormValues,
} from '../types/auth-ui';

interface RegisterViewModelInput {
  submit: (payload: RegisterRequest) => Promise<AuthMutationResult>;
}

export const REGISTER_STEP_ORDER: RegisterField[] = [
  'email',
  'name',
  'password',
  'confirmPassword',
];

export const REGISTER_STEP_COPY: Record<
  RegisterField,
  { title: string; description: string }
> = {
  email: {
    title: '이메일을 입력해 주세요',
    description: '인증과 안내를 받을 주소입니다.',
  },
  name: {
    title: '이름을 입력해 주세요',
    description: '실명 기준으로 입력해 주세요.',
  },
  password: {
    title: '비밀번호를 설정해 주세요',
    description: '정책을 만족하면 바로 다음 항목으로 이동합니다.',
  },
  confirmPassword: {
    title: '비밀번호를 한 번 더 입력해 주세요',
    description: '마지막 Enter로 바로 회원가입을 완료합니다.',
  },
};

export const REGISTER_FIELD_LABELS: Record<RegisterField, string> = {
  email: '이메일',
  name: '이름',
  password: '비밀번호',
  confirmPassword: '비밀번호 확인',
};

const createInitialRegisterValues = (): RegisterFormValues => ({
  email: '',
  name: '',
  password: '',
  confirmPassword: '',
});

const getFirstInvalidField = (
  feedback: RegisterFormFeedback,
): RegisterField | null => {
  for (const field of REGISTER_STEP_ORDER) {
    if (feedback.fieldErrors[field]) {
      return field;
    }
  }

  return null;
};

export const getRegisterFieldPreview = (
  field: RegisterField,
  values: RegisterFormValues,
): string => {
  switch (field) {
    case 'password':
    case 'confirmPassword':
      return values[field] ? '*'.repeat(Math.max(values[field].length, 8)) : '';
    case 'email':
      return values.email.trim();
    case 'name':
      return values.name.trim();
    default:
      return '';
  }
};

export const useRegisterViewModel = ({ submit }: RegisterViewModelInput) => {
  const [values, setValues] = useState<RegisterFormValues>(createInitialRegisterValues);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] =
    useState<RegisterFormFeedback>(createEmptyRegisterFeedback);

  const activeField = REGISTER_STEP_ORDER[activeStepIndex];
  const completedFields = REGISTER_STEP_ORDER.slice(0, activeStepIndex);
  const stepCopy = REGISTER_STEP_COPY[activeField];
  const passwordPolicyState = getPasswordPolicyState(values.password);
  const confirmPasswordState = getConfirmPasswordState(values);
  const {
    message: keyboardStepMessage,
    tone: keyboardStepTone,
  } = getRegisterKeyboardMessage(
    activeField,
    values,
    feedback,
    stepCopy.description,
  );

  const setFieldFeedback = (
    field: RegisterField,
    message?: string,
  ) => {
    setFeedback((current) => ({
      ...current,
      globalMessage: null,
      fieldErrors: {
        ...current.fieldErrors,
        [field]: Boolean(message),
      },
      fieldMessages: {
        ...current.fieldMessages,
        [field]: message,
      },
    }));
  };

  const clearField = (field: RegisterField) => {
    setFieldFeedback(field, undefined);
  };

  const updateValue = (
    field: RegisterField,
    value: string,
  ) => {
    clearField(field);

    setValues((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const validateStep = (field: RegisterField): boolean => {
    const message = validateRegisterField(field, values);

    if (message) {
      setFieldFeedback(field, message);
      return false;
    }

    clearField(field);

    return true;
  };

  const focusStep = (index: number) => {
    setActiveStepIndex(index);
  };

  const submitRegister = async () => {
    if (isSubmitting) {
      return;
    }

    const validation = validateRegisterForm(values);

    if (!validation.valid) {
      setFeedback(validation.feedback);
      const firstInvalidField = getFirstInvalidField(validation.feedback);

      if (firstInvalidField) {
        focusStep(REGISTER_STEP_ORDER.indexOf(firstInvalidField));
      }

      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submit(validation.payload);

      if (!result.success) {
        const nextFeedback = getRegisterErrorFeedback(result.error);
        setFeedback(nextFeedback);
        const invalidField = getFirstInvalidField(nextFeedback);

        if (invalidField) {
          focusStep(REGISTER_STEP_ORDER.indexOf(invalidField));
        }
        return;
      }

      setFeedback(validation.feedback);
    } finally {
      setIsSubmitting(false);
    }
  };

  const advanceFromField = (field: RegisterField) => {
    if (isSubmitting || !validateStep(field)) {
      return;
    }

    const currentIndex = REGISTER_STEP_ORDER.indexOf(field);
    const nextIndex = currentIndex + 1;

    if (nextIndex >= REGISTER_STEP_ORDER.length) {
      void submitRegister();
      return;
    }

    focusStep(nextIndex);
  };

  return {
    values,
    showPassword,
    showConfirmPassword,
    activeStepIndex,
    activeField,
    completedFields,
    isSubmitting,
    feedback,
    stepCopy,
    passwordPolicyState,
    confirmPasswordState,
    keyboardStepMessage,
    keyboardStepTone,
    updateValue,
    focusStep,
    advanceFromField,
    submitRegister,
    togglePasswordVisibility: () => {
      setShowPassword((current) => !current);
    },
    toggleConfirmPasswordVisibility: () => {
      setShowConfirmPassword((current) => !current);
    },
  };
};
