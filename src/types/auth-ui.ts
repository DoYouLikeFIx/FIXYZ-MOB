import type {
  LoginChallenge,
  Member,
  PasswordForgotResponse,
  PasswordRecoveryChallengeResponse,
  RegisterRequest,
  TotpEnrollmentBootstrap,
} from './auth';

export type AuthMode = 'login' | 'register';

export interface LoginFieldErrors {
  email: boolean;
  password: boolean;
}

export type LoginField = keyof LoginFieldErrors;

export interface RegisterFieldErrors {
  email: boolean;
  name: boolean;
  password: boolean;
  confirmPassword: boolean;
}

export type RegisterField = keyof RegisterFieldErrors;

export interface ForgotPasswordFieldErrors {
  email: boolean;
  challengeAnswer: boolean;
}

export type ForgotPasswordField = keyof ForgotPasswordFieldErrors;

export interface ResetPasswordFieldErrors {
  token: boolean;
  newPassword: boolean;
}

export type ResetPasswordField = keyof ResetPasswordFieldErrors;

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

export interface ForgotPasswordFormFeedback {
  globalMessage: string | null;
  fieldErrors: ForgotPasswordFieldErrors;
  fieldMessages: Partial<Record<ForgotPasswordField, string>>;
}

export interface ResetPasswordFormFeedback {
  globalMessage: string | null;
  fieldErrors: ResetPasswordFieldErrors;
  fieldMessages: Partial<Record<ResetPasswordField, string>>;
}

export type FormSubmissionResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: unknown;
    };

export type AuthMutationResult =
  | {
      success: true;
      member: Member;
    }
  | {
      success: false;
      error: unknown;
    };

export type LoginPhaseResult =
  | {
      success: true;
      challenge: LoginChallenge;
    }
  | {
      success: false;
      error: unknown;
    };

export type TotpEnrollmentBootstrapResult =
  | {
      success: true;
      enrollment: TotpEnrollmentBootstrap;
    }
  | {
      success: false;
      error: unknown;
    };

export type ProtectedRequestResult =
  | {
      status: 'authenticated';
      member: Member;
    }
  | {
      status: 'reauth';
      error: unknown;
    }
  | {
      status: 'error';
      error: unknown;
    };

export interface BootstrapResult {
  recoveredSession: boolean;
  member: Member | null;
  error: unknown | null;
}

export type PasswordForgotResult =
  | {
      success: true;
      response: PasswordForgotResponse;
    }
  | {
      success: false;
      error: unknown;
    };

export type PasswordRecoveryChallengeResult =
  | {
      success: true;
      challenge: PasswordRecoveryChallengeResponse;
    }
  | {
      success: false;
      error: unknown;
    };

export type PasswordResetResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: unknown;
    };

export type FieldMessageTone = 'neutral' | 'success' | 'error';

export const createLoginFieldErrors = (): LoginFieldErrors => ({
  email: false,
  password: false,
});

export const createRegisterFieldErrors = (): RegisterFieldErrors => ({
  email: false,
  name: false,
  password: false,
  confirmPassword: false,
});

export const createForgotPasswordFieldErrors = (): ForgotPasswordFieldErrors => ({
  email: false,
  challengeAnswer: false,
});

export const createResetPasswordFieldErrors = (): ResetPasswordFieldErrors => ({
  token: false,
  newPassword: false,
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

export const createEmptyForgotPasswordFeedback = (): ForgotPasswordFormFeedback => ({
  globalMessage: null,
  fieldErrors: createForgotPasswordFieldErrors(),
  fieldMessages: {},
});

export const createEmptyResetPasswordFeedback = (): ResetPasswordFormFeedback => ({
  globalMessage: null,
  fieldErrors: createResetPasswordFieldErrors(),
  fieldMessages: {},
});
