import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

vi.mock('react-native', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-native')>();

  class AnimatedValue {
    constructor(private currentValue: number) {}

    setValue(nextValue: number) {
      this.currentValue = nextValue;
    }
  }

  return {
    ...actual,
    Animated: {
      View: 'Animated.View',
      Value: AnimatedValue,
      timing: () => ({
        start: (callback?: () => void) => {
          callback?.();
        },
      }),
      parallel: () => ({
        start: (callback?: () => void) => {
          callback?.();
        },
      }),
    },
    Easing: {
      out: (value: unknown) => value,
      cubic: 'cubic',
      ease: 'ease',
    },
  };
});

import { AppNavigator } from '@/navigation/AppNavigator';
import {
  createAuthNavigationState,
  openMfaRecoveryRebindRoute,
  openMfaRecoveryRoute,
} from '@/navigation/auth-navigation';
import type { MfaRecoveryState } from '@/auth/auth-flow-view-model';
import type { AccountApi } from '@/api/account-api';
import type { OrderApi } from '@/api/order-api';
import type { MfaRecoveryRebindConfirmationResult } from '@/types/auth-ui';

const flushPromises = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

const bootstrapFixture = {
  rebindToken: 'rebind-token',
  qrUri: 'otpauth://totp/FIX:demo@fix.com?secret=ABC123',
  manualEntryKey: 'ABC123',
  enrollmentToken: 'enrollment-token',
  expiresAt: '2026-03-12T10:05:00Z',
};

const mfaRecoveryFixture: MfaRecoveryState = {
  suggestedEmail: 'demo@fix.com',
  recoveryProof: null,
  recoveryProofExpiresInSeconds: null,
  bootstrap: null,
};

const findAllByTestId = (root: ReactTestInstance, testId: string) =>
  root.findAll((node) => node.props?.testID === testId);

const findByTestId = (root: ReactTestInstance, testId: string) => {
  const matches = findAllByTestId(root, testId);

  if (matches.length === 0) {
    throw new Error(`Unable to find node with testID=${testId}`);
  }

  return matches[0];
};

const findText = (root: ReactTestInstance, text: string) =>
  root.findAll(
    (node) => String(node.type) === 'Text' && node.children.join('') === text,
  );

const renderNavigator = (
  options: {
    navigationState?: ReturnType<typeof createAuthNavigationState>;
    authBannerMessage?: string | null;
    authBannerTone?: 'info' | 'error' | 'success';
    mfaRecovery?: MfaRecoveryState | null;
    onSubmitMfaRecoveryRebind?: () => Promise<MfaRecoveryRebindConfirmationResult>;
    onRestartMfaRecovery?: (options?: { bannerMessage?: string | null; bannerTone?: 'info' | 'error' | 'success' }) => void;
  } = {},
): ReactTestRenderer => {
  let renderer: ReactTestRenderer | null = null;

  act(() => {
    renderer = create(
      <AppNavigator
        accountApi={{} as AccountApi}
        animationsDisabled
        orderApi={{} as OrderApi}
        authStatus="anonymous"
        member={null}
        reauthMessage={null}
        navigationState={options.navigationState ?? openMfaRecoveryRoute(createAuthNavigationState())}
        authBannerMessage={options.authBannerMessage ?? null}
        authBannerTone={options.authBannerTone ?? 'info'}
        bootstrapErrorMessage={null}
        protectedErrorMessage={null}
        isRefreshingSession={false}
        pendingMfa={null}
        mfaRecovery={options.mfaRecovery ?? mfaRecoveryFixture}
        onLoginSubmit={async () => ({ success: true })}
        onLoginMfaSubmit={async () => ({ success: true })}
        onRegisterSubmit={async () => ({ success: true })}
        onOpenLogin={() => {}}
        onRequireEnrollmentRestart={() => {}}
        onOpenRegister={() => {}}
        onOpenForgotPassword={() => {}}
        onOpenResetPassword={() => {}}
        onOpenAuthenticatedMfaRecovery={() => {}}
        onResetPendingMfa={() => {}}
        onLoadTotpEnrollment={async () => ({
          success: true,
          enrollment: {
            qrUri: 'otpauth://totp/FIX:demo@fix.com?secret=ABC123',
            manualEntryKey: 'ABC123',
            enrollmentToken: 'enrollment-token',
            expiresAt: '2026-03-12T10:05:00Z',
          },
        })}
        onSubmitTotpEnrollment={async () => ({ success: true })}
        onPasswordForgotSubmit={async () => ({
          success: true,
          response: {
            accepted: true,
            message: 'accepted',
            recovery: {
              challengeEndpoint: '/api/v1/auth/password/forgot/challenge',
              challengeMayBeRequired: true,
            },
          },
        })}
        onPasswordChallengeSubmit={async () => ({
          success: true,
          challenge: {
            challengeToken: 'challenge-token',
            challengeType: 'captcha',
            challengeTtlSeconds: 300,
          },
        })}
        onPasswordResetSubmit={async () => ({
          success: true,
          continuation: {},
        })}
        onAuthenticatedMfaRecoveryBootstrap={async () => ({
          success: true,
          bootstrap: bootstrapFixture,
        })}
        onRecoveryMfaRecoveryBootstrap={async () => ({
          success: true,
          bootstrap: bootstrapFixture,
        })}
        onRestartMfaRecovery={options.onRestartMfaRecovery ?? (() => {})}
        onSubmitMfaRecoveryRebind={options.onSubmitMfaRecoveryRebind ?? (async () => ({
          success: true,
          response: {
            rebindCompleted: true,
            reauthRequired: true,
          },
        }))}
        onRefreshProtectedSession={() => {}}
      />,
    );
  });

  if (!renderer) {
    throw new Error('Renderer was not created.');
  }

  return renderer;
};

describe('AppNavigator MFA recovery composition', () => {
  it('passes the recovery restart banner through to the MFA recovery screen', () => {
    const renderer = renderNavigator({
      authBannerMessage: '복구 단계를 다시 시작해 주세요.',
      authBannerTone: 'error',
    });

    expect(findText(renderer.root, '복구 단계를 다시 시작해 주세요.')).toHaveLength(1);
    expect(findByTestId(renderer.root, 'mfa-recovery-open-forgot-password')).toBeTruthy();

    act(() => {
      renderer.unmount();
    });
  });

  it('routes stale rebind failures from the navigator into the recovery restart handler', async () => {
    const onRestartMfaRecovery = vi.fn();
    const onSubmitMfaRecoveryRebind = vi.fn<
      () => Promise<MfaRecoveryRebindConfirmationResult>
    >(async () => ({
      success: false as const,
      error: {
        code: 'AUTH-020',
        status: 409,
        message: 'mfa recovery proof already consumed',
      },
    }));
    const renderer = renderNavigator({
      navigationState: openMfaRecoveryRebindRoute(createAuthNavigationState()),
      mfaRecovery: {
        ...mfaRecoveryFixture,
        bootstrap: bootstrapFixture,
      },
      onRestartMfaRecovery,
      onSubmitMfaRecoveryRebind,
    });

    await act(async () => {
      findByTestId(renderer.root, 'mfa-recovery-code').props.onChangeText('123456');
      await flushPromises();
    });

    await act(async () => {
      findByTestId(renderer.root, 'mfa-recovery-confirm-submit').props.onPress();
      await flushPromises();
    });

    expect(onSubmitMfaRecoveryRebind).toHaveBeenCalledTimes(1);
    expect(onRestartMfaRecovery).toHaveBeenCalledWith({
      bannerMessage: '이미 사용된 복구 단계입니다. 비밀번호 재설정을 다시 진행해 주세요.',
      bannerTone: 'error',
    });

    act(() => {
      renderer.unmount();
    });
  });
});
