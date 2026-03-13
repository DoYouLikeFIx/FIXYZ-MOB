import type { NormalizedHttpError } from '@/network/types';
import {
  getLoginErrorFeedback,
  getRegisterErrorFeedback,
  getReauthMessage,
  isReauthError,
  resolveMfaErrorPresentation,
  resolveAuthErrorPresentation,
} from '@/auth/auth-errors';
import { NETWORK_ERROR_MESSAGE } from '@/network/errors';
import { authErrorContract } from '../../fixtures/auth-error-contract';
import { recoveryChallengeAuthErrorContract } from '../../fixtures/recovery-challenge-auth-error-contract';

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
  error.retryAfterSeconds = overrides.retryAfterSeconds;
  error.traceId = overrides.traceId;
  error.enrollUrl = overrides.enrollUrl;
  error.recoveryUrl = overrides.recoveryUrl;

  return error;
};

describe('mobile auth error presentation', () => {
  for (const { codes, semantic, recoveryAction, message } of authErrorContract.cases) {
    it(`matches the mobile auth contract for ${codes.join(', ')}`, () => {
      for (const code of codes) {
        const presentation = resolveAuthErrorPresentation(
          createHttpError({ code, message: `${code} server message` }),
        );

        expect(presentation.semantic).toBe(semantic);
        expect(presentation.recoveryAction).toBe(recoveryAction);
        expect(presentation.message).toBe(message);
      }
    });
  }

  for (const { codes, semantic, recoveryAction, message } of recoveryChallengeAuthErrorContract.cases) {
    it(`matches the mobile recovery-challenge auth contract for ${codes.join(', ')}`, () => {
      for (const code of codes) {
        const presentation = resolveAuthErrorPresentation(
          createHttpError({ code, message: `${code} server message` }),
        );

        expect(presentation.semantic).toBe(semantic);
        expect(presentation.recoveryAction).toBe(recoveryAction);
        expect(presentation.message).toBe(message);
      }
    });
  }

  it('maps duplicate email failures to the register email field', () => {
    expect(
      getRegisterErrorFeedback(
        createHttpError({ code: 'AUTH-017', message: 'Email already exists' }),
      ),
    ).toMatchObject({
      globalMessage: null,
      fieldErrors: {
        email: true,
      },
      fieldMessages: {
        email: '이미 가입된 이메일입니다. 다른 이메일을 입력해 주세요.',
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
      globalMessage: '이메일 또는 비밀번호가 올바르지 않습니다.',
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

  it('maps password-recovery codes to deterministic reset guidance', () => {
    expect(
      resolveAuthErrorPresentation(createHttpError({ code: 'AUTH-012', status: 401 })),
    ).toMatchObject({
      semantic: 'password-reset-token-invalid',
      message: '재설정 링크가 유효하지 않거나 만료되었습니다. 비밀번호 재설정을 다시 요청해 주세요.',
    });

    expect(
      resolveAuthErrorPresentation(createHttpError({ code: 'AUTH-013', status: 409 })),
    ).toMatchObject({
      semantic: 'password-reset-token-consumed',
      message: '이미 사용된 재설정 링크입니다. 새로운 재설정 링크를 요청해 주세요.',
    });

    expect(
      resolveAuthErrorPresentation(createHttpError({ code: 'AUTH-015', status: 422 })),
    ).toMatchObject({
      semantic: 'password-reset-same-password',
      message: '현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.',
    });
  });

  it('includes Retry-After guidance for password-recovery rate limits', () => {
    expect(
      resolveAuthErrorPresentation(
        createHttpError({
          code: 'AUTH-014',
          retryAfterSeconds: 90,
          status: 429,
        }),
      ),
    ).toMatchObject({
      semantic: 'password-reset-rate-limited',
      message: '비밀번호 재설정 요청이 너무 많습니다. 90초 후 다시 시도해 주세요.',
    });
  });

  it('maps MFA recovery proof failures to deterministic retry guidance', () => {
    expect(
      resolveMfaErrorPresentation(createHttpError({ code: 'AUTH-019', status: 401 })),
    ).toMatchObject({
      code: 'AUTH-019',
      message: '복구 단계가 유효하지 않거나 만료되었습니다. 비밀번호 재설정을 다시 진행해 주세요.',
      navigateToRecovery: false,
      restartLogin: false,
    });

    expect(
      resolveMfaErrorPresentation(createHttpError({ code: 'AUTH-020', status: 409 })),
    ).toMatchObject({
      code: 'AUTH-020',
      message: '이미 사용된 복구 단계입니다. 비밀번호 재설정을 다시 진행해 주세요.',
      navigateToRecovery: false,
      restartLogin: false,
    });
  });

  it('maps authenticated MFA rebind password mismatches to retry guidance', () => {
    expect(
      resolveMfaErrorPresentation(createHttpError({ code: 'AUTH-026', status: 401 })),
    ).toMatchObject({
      code: 'AUTH-026',
      message: '현재 비밀번호가 일치하지 않습니다. 다시 입력해 주세요.',
      navigateToRecovery: false,
      restartLogin: false,
    });
  });

  it('preserves enrollment metadata for authenticated MFA recovery enrollment-required errors', () => {
    expect(
      resolveMfaErrorPresentation(
        createHttpError({
          code: 'AUTH-009',
          status: 403,
          enrollUrl: '/settings/totp/enroll?source=mfa-recovery',
        }),
      ),
    ).toMatchObject({
      code: 'AUTH-009',
      navigateToEnroll: true,
      enrollUrl: '/settings/totp/enroll?source=mfa-recovery',
      message: 'Google Authenticator 등록이 필요합니다. 인증 앱을 연결한 뒤 첫 코드를 확인해 주세요.',
    });
  });

  it('surfaces recovery navigation metadata for MFA recovery-required errors', () => {
    expect(
      resolveMfaErrorPresentation(
        createHttpError({
          code: 'AUTH-021',
          status: 403,
          recoveryUrl: '/mfa-recovery',
        }),
      ),
    ).toMatchObject({
      code: 'AUTH-021',
      navigateToRecovery: true,
      recoveryUrl: '/mfa-recovery',
      message: '기존 인증기를 사용할 수 없어 복구가 필요합니다. 새 인증 앱을 연결하는 복구 단계를 진행해 주세요.',
    });
  });
});
