import {
  getConfirmPasswordState,
  getPasswordPolicyState,
  getResetPasswordState,
  getRegisterKeyboardMessage,
  validateForgotPasswordForm,
  validateRegisterField,
  validateRegisterForm,
  validateResetPasswordForm,
} from '@/auth/form-validation';
import { createEmptyRegisterFeedback } from '@/types/auth-ui';

describe('auth form validation', () => {
  it('reuses the shared register field validation for step navigation and submit validation', () => {
    const invalidValues = {
      email: 'new@fix.com',
      name: '',
      password: 'Test1234!',
      confirmPassword: 'Test1234!',
    };

    expect(validateRegisterField('name', invalidValues)).toBe('이름을 입력해 주세요.');

    const result = validateRegisterForm(invalidValues);

    expect(result.valid).toBe(false);
    expect(result.feedback.fieldMessages.name).toBe('이름을 입력해 주세요.');
  });

  it('exposes password policy state from the shared validation module', () => {
    expect(getPasswordPolicyState('short')).toEqual({
      isValid: false,
      message: '8자 이상, 대문자, 숫자, 특수문자를 포함해 주세요.',
      tone: 'neutral',
    });
    expect(getPasswordPolicyState('Test1234!')).toEqual({
      isValid: true,
      message: '사용 가능한 비밀번호 형식입니다.',
      tone: 'success',
    });
  });

  it('exposes confirm-password state from the shared validation module', () => {
    expect(
      getConfirmPasswordState({
        password: 'Test1234!',
        confirmPassword: '',
      }),
    ).toEqual({
      isDirty: false,
      isValid: false,
      message: '비밀번호 확인을 입력해 주세요.',
      tone: 'neutral',
    });

    expect(
      getConfirmPasswordState({
        password: 'Test1234!',
        confirmPassword: 'Test1234!',
      }),
    ).toEqual({
      isDirty: true,
      isValid: true,
      message: '비밀번호가 일치합니다.',
      tone: 'success',
    });
  });

  it('prioritizes shared field feedback over default keyboard guidance', () => {
    const feedback = createEmptyRegisterFeedback();
    feedback.fieldMessages.password = '비밀번호 정책을 모두 충족해 주세요.';

    expect(
      getRegisterKeyboardMessage(
        'password',
        {
          email: 'new@fix.com',
          name: 'New User',
          password: 'short',
          confirmPassword: '',
        },
        feedback,
        '정책을 만족하면 바로 다음 항목으로 이동합니다.',
      ),
    ).toEqual({
      message: '비밀번호 정책을 모두 충족해 주세요.',
      tone: 'error',
    });
  });

  it('validates forgot-password email and optional challenge answers', () => {
    expect(
      validateForgotPasswordForm({
        email: 'bad-email',
      }),
    ).toMatchObject({
      valid: false,
      feedback: {
        fieldMessages: {
          email: '올바른 이메일 형식을 입력해 주세요.',
        },
      },
    });

    expect(
      validateForgotPasswordForm({
        email: 'demo@fix.com',
        challengeToken: 'challenge-token',
        challengeAnswer: '',
      }),
    ).toMatchObject({
      valid: false,
      feedback: {
        fieldMessages: {
          challengeAnswer: '보안 확인 응답을 입력해 주세요.',
        },
      },
    });
  });

  it('validates reset-password token and password policy', () => {
    expect(
      validateResetPasswordForm({
        token: '',
        newPassword: 'Test1234!',
      }),
    ).toMatchObject({
      valid: false,
      feedback: {
        fieldMessages: {
          token: '재설정 토큰을 입력해 주세요.',
        },
      },
    });

    expect(getResetPasswordState('short')).toEqual({
      isValid: false,
      message: '8자 이상, 대문자, 숫자, 특수문자를 포함해 주세요.',
      tone: 'neutral',
    });
  });
});
