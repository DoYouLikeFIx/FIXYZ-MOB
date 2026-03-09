import type { NormalizedHttpError } from '@/network/types';
import {
  getLoginErrorFeedback,
  getRegisterErrorFeedback,
  getReauthMessage,
  isReauthError,
} from '@/auth/auth-errors';

const createHttpError = (
  overrides: Partial<NormalizedHttpError> & { message?: string } = {},
): NormalizedHttpError => {
  const error = new Error(
    overrides.message ?? 'Unexpected server response. Please try again.',
  ) as NormalizedHttpError;

  error.name = 'MobHttpClientError';
  error.code = overrides.code;
  error.status = overrides.status;
  error.detail = overrides.detail;
  error.retriable = overrides.retriable;

  return error;
};

describe('mobile auth error presentation', () => {
  it('maps duplicate username failures to the register username field', () => {
    expect(
      getRegisterErrorFeedback(
        createHttpError({ code: 'AUTH-008', message: 'Username already exists' }),
      ),
    ).toMatchObject({
      globalMessage: null,
      fieldErrors: {
        username: true,
      },
      fieldMessages: {
        username: '이미 사용 중인 아이디입니다. 다른 아이디를 선택해 주세요.',
      },
    });
  });

  it('maps password policy failures to the register password field', () => {
    expect(
      getRegisterErrorFeedback(
        createHttpError({ code: 'AUTH-007', message: 'Password policy violated' }),
      ),
    ).toMatchObject({
      globalMessage: null,
      fieldErrors: {
        password: true,
      },
      fieldMessages: {
        password: '비밀번호는 8자 이상이며 대문자, 숫자, 특수문자를 포함해야 합니다.',
      },
    });
  });

  it('keeps invalid login credentials as a single global message', () => {
    expect(
      getLoginErrorFeedback(
        createHttpError({ code: 'AUTH-001', message: 'Credential mismatch' }),
      ),
    ).toMatchObject({
      globalMessage: '아이디 또는 비밀번호가 올바르지 않습니다.',
      fieldMessages: {},
    });
  });

  it('detects re-authentication errors and returns the canonical guidance copy', () => {
    const error = createHttpError({ code: 'CHANNEL-001', status: 410 });

    expect(isReauthError(error)).toBe(true);
    expect(getReauthMessage(error)).toBe('세션이 만료되었습니다. 다시 로그인해 주세요.');
  });
});
