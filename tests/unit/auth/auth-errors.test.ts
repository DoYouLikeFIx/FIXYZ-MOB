import authErrorContract from '../../../../docs/contracts/auth-error-standardization.json';
import type { NormalizedHttpError } from '@/network/types';
import {
  getLoginErrorFeedback,
  getRegisterErrorFeedback,
  getReauthMessage,
  isReauthError,
  resolveAuthErrorPresentation,
} from '@/auth/auth-errors';
import { NETWORK_ERROR_MESSAGE } from '@/network/errors';

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
  error.traceId = overrides.traceId;

  return error;
};

describe('mobile auth error presentation', () => {
  it.each(authErrorContract.cases)(
    'matches the mobile auth contract for %s',
    ({ codes, semantic, recoveryAction, message }) => {
      for (const code of codes) {
        const presentation = resolveAuthErrorPresentation(
          createHttpError({ code, message: `${code} server message` }),
        );

        expect(presentation.semantic).toBe(semantic);
        expect(presentation.recoveryAction).toBe(recoveryAction);
        expect(presentation.message).toBe(message);
      }
    },
  );

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

  it('uses the safe fallback and exposes the correlation id for unknown backend codes', () => {
    const presentation = resolveAuthErrorPresentation(
      createHttpError({
        code: 'AUTH-999',
        message: 'Raw backend exception should not leak',
        traceId: 'corr-123',
      }),
    );

    expect(presentation.semantic).toBe(authErrorContract.unknownFallback.semantic);
    expect(presentation.recoveryAction).toBe(
      authErrorContract.unknownFallback.recoveryAction,
    );
    expect(presentation.message).toBe(
      `${authErrorContract.unknownFallback.message} ${authErrorContract.supportReferenceLabel}: corr-123`,
    );
  });

  it('preserves client-generated transport guidance when no backend auth code exists', () => {
    expect(
      getLoginErrorFeedback(createHttpError({ message: NETWORK_ERROR_MESSAGE })),
    ).toMatchObject({
      globalMessage: NETWORK_ERROR_MESSAGE,
    });
  });
});
