import type { RegisterRequest } from './auth';

export type AuthMode = 'login' | 'register';

export interface LoginFieldErrors {
  username: boolean;
  password: boolean;
}

export type LoginField = keyof LoginFieldErrors;

export interface RegisterFieldErrors {
  username: boolean;
  email: boolean;
  name: boolean;
  password: boolean;
  confirmPassword: boolean;
}

export type RegisterField = keyof RegisterFieldErrors;

export interface LoginFormFeedback {
  globalMessage: string | null;
  fieldErrors: LoginFieldErrors;
  fieldMessages: Partial<Record<LoginField, string>>;
}

export interface RegisterFormValues extends RegisterRequest {
  confirmPassword: string;
}

export interface RegisterFormFeedback {
  globalMessage: string | null;
  fieldErrors: RegisterFieldErrors;
  fieldMessages: Partial<Record<RegisterField, string>>;
}

export type FieldMessageTone = 'neutral' | 'success' | 'error';

export const createLoginFieldErrors = (): LoginFieldErrors => ({
  username: false,
  password: false,
});

export const createRegisterFieldErrors = (): RegisterFieldErrors => ({
  username: false,
  email: false,
  name: false,
  password: false,
  confirmPassword: false,
});

export const createEmptyLoginFeedback = (): LoginFormFeedback => ({
  globalMessage: null,
  fieldErrors: createLoginFieldErrors(),
  fieldMessages: {},
});

export const createEmptyRegisterFeedback = (): RegisterFormFeedback => ({
  globalMessage: null,
  fieldErrors: createRegisterFieldErrors(),
  fieldMessages: {},
});
