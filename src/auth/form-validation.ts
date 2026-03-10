import {
  getPasswordPolicyChecks,
  isPasswordPolicySatisfied,
} from '../lib/password-policy';
import type { LoginRequest, RegisterRequest } from '../types/auth';
import {
  createEmptyLoginFeedback,
  createEmptyRegisterFeedback,
  type FieldMessageTone,
  type LoginFormFeedback,
  type RegisterField,
  type RegisterFormFeedback,
  type RegisterFormValues,
} from '../types/auth-ui';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_POLICY_GUIDANCE =
  '8자 이상, 대문자, 숫자, 특수문자를 포함해 주세요.';
const PASSWORD_POLICY_ERROR = '비밀번호 정책을 모두 충족해 주세요.';
const REGISTER_FIELD_ORDER: RegisterField[] = [
  'email',
  'name',
  'password',
  'confirmPassword',
];

const trimValue = (value: string) => value.trim();

const getEmailValidationMessage = (email: string): string | undefined => {
  const normalizedEmail = trimValue(email);

  if (!normalizedEmail) {
    return '이메일을 입력해 주세요.';
  }

  return EMAIL_PATTERN.test(normalizedEmail)
    ? undefined
    : '올바른 이메일 형식을 입력해 주세요.';
};

const getNameValidationMessage = (name: string): string | undefined =>
  trimValue(name) ? undefined : '이름을 입력해 주세요.';

export interface PasswordPolicyState {
  isValid: boolean;
  message: string;
  tone: Exclude<FieldMessageTone, 'error'>;
}

export const getPasswordPolicyState = (password: string): PasswordPolicyState => {
  const checks = getPasswordPolicyChecks(password);
  const isValid = isPasswordPolicySatisfied(checks);

  return {
    isValid,
    message: isValid
      ? '사용 가능한 비밀번호 형식입니다.'
      : PASSWORD_POLICY_GUIDANCE,
    tone: isValid ? 'success' : 'neutral',
  };
};

export interface ConfirmPasswordState {
  isDirty: boolean;
  isValid: boolean;
  message: string;
  tone: FieldMessageTone;
}

export const getConfirmPasswordState = (
  values: Pick<RegisterFormValues, 'password' | 'confirmPassword'>,
): ConfirmPasswordState => {
  const isDirty = values.confirmPassword.length > 0;
  const isValid = isDirty && values.password === values.confirmPassword;

  return {
    isDirty,
    isValid,
    message: isDirty
      ? isValid
        ? '비밀번호가 일치합니다.'
        : '비밀번호 확인이 일치하지 않습니다.'
      : '비밀번호 확인을 입력해 주세요.',
    tone: isDirty ? (isValid ? 'success' : 'error') : 'neutral',
  };
};

export const validateRegisterField = (
  field: RegisterField,
  values: RegisterFormValues,
): string | undefined => {
  switch (field) {
    case 'email':
      return getEmailValidationMessage(values.email);
    case 'name':
      return getNameValidationMessage(values.name);
    case 'password':
      if (!values.password) {
        return '비밀번호를 입력해 주세요.';
      }

      return getPasswordPolicyState(values.password).isValid
        ? undefined
        : PASSWORD_POLICY_ERROR;
    case 'confirmPassword':
      if (!values.confirmPassword) {
        return '비밀번호 확인을 입력해 주세요.';
      }

      return getConfirmPasswordState(values).isValid
        ? undefined
        : '비밀번호 확인이 일치하지 않습니다.';
    default:
      return undefined;
  }
};

interface ValidatedLoginResult {
  valid: true;
  payload: LoginRequest;
  feedback: LoginFormFeedback;
}

interface InvalidLoginResult {
  valid: false;
  feedback: LoginFormFeedback;
}

export const validateLoginForm = (
  values: LoginRequest,
): ValidatedLoginResult | InvalidLoginResult => {
  const email = trimValue(values.email);
  const feedback = createEmptyLoginFeedback();
  const emailValidationMessage = getEmailValidationMessage(values.email);

  if (emailValidationMessage) {
    feedback.fieldErrors.email = true;
    feedback.fieldMessages.email = emailValidationMessage;

    return {
      valid: false,
      feedback,
    };
  }

  if (!values.password) {
    feedback.fieldErrors.password = true;
    feedback.fieldMessages.password = '비밀번호를 입력해 주세요.';

    return {
      valid: false,
      feedback,
    };
  }

  return {
    valid: true,
    payload: {
      email,
      password: values.password,
    },
    feedback,
  };
};

interface ValidatedRegisterResult {
  valid: true;
  payload: RegisterRequest;
  feedback: RegisterFormFeedback;
}

interface InvalidRegisterResult {
  valid: false;
  feedback: RegisterFormFeedback;
}

export const validateRegisterForm = (
  values: RegisterFormValues,
): ValidatedRegisterResult | InvalidRegisterResult => {
  const email = trimValue(values.email);
  const name = trimValue(values.name);
  const feedback = createEmptyRegisterFeedback();

  for (const field of REGISTER_FIELD_ORDER) {
    const message = validateRegisterField(field, values);

    if (message) {
      feedback.fieldErrors[field] = true;
      feedback.fieldMessages[field] = message;

      return {
        valid: false,
        feedback,
      };
    }
  }

  return {
    valid: true,
    payload: {
      email,
      name,
      password: values.password,
    },
    feedback,
  };
};

export const getRegisterKeyboardMessage = (
  field: RegisterField,
  values: RegisterFormValues,
  feedback: RegisterFormFeedback,
  defaultDescription: string,
): {
  message: string;
  tone: FieldMessageTone;
} => {
  if (field === 'password') {
    if (feedback.fieldMessages.password) {
      return {
        message: feedback.fieldMessages.password,
        tone: 'error',
      };
    }

    const passwordPolicyState = getPasswordPolicyState(values.password);

    return {
      message: passwordPolicyState.message,
      tone: passwordPolicyState.tone,
    };
  }

  if (field === 'confirmPassword') {
    if (feedback.fieldMessages.confirmPassword) {
      return {
        message: feedback.fieldMessages.confirmPassword,
        tone: 'error',
      };
    }

    const confirmPasswordState = getConfirmPasswordState(values);

    return {
      message: confirmPasswordState.message,
      tone: confirmPasswordState.tone,
    };
  }

  return {
    message: defaultDescription,
    tone: 'neutral',
  };
};
