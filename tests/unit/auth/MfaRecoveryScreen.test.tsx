import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

import { MfaRecoveryScreen } from '@/screens/auth/MfaRecoveryScreen';
import type { MfaRecoveryState } from '@/auth/auth-flow-view-model';
import type { Member } from '@/types/auth';
import type { TotpRebindBootstrapResult } from '@/types/auth-ui';

const memberFixture: Member = {
  memberUuid: 'member-001',
  email: 'demo@fix.com',
  name: 'Demo User',
  role: 'ROLE_USER',
  totpEnrolled: true,
  accountId: '1',
};

const flushPromises = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
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

const renderScreen = (
  options: {
    authStatus?: 'checking' | 'anonymous' | 'authenticated';
    bannerMessage?: string | null;
    bannerTone?: 'info' | 'error' | 'success';
    member?: Member | null;
    mfaRecovery?: MfaRecoveryState | null;
    onBootstrapAuthenticated?: (
      payload: { currentPassword: string },
    ) => Promise<TotpRebindBootstrapResult>;
    onRequireEnrollmentRestart?: (message: string) => void;
  } = {},
): ReactTestRenderer => {
  let renderer: ReactTestRenderer | null = null;

  act(() => {
    renderer = create(
      <MfaRecoveryScreen
        authStatus={options.authStatus ?? 'anonymous'}
        bannerMessage={options.bannerMessage ?? null}
        bannerTone={options.bannerTone ?? 'info'}
        member={options.member ?? null}
        mfaRecovery={options.mfaRecovery ?? null}
        onBootstrapAuthenticated={
          options.onBootstrapAuthenticated
          ?? (async () => ({
            success: true as const,
            bootstrap: {
              rebindToken: 'rebind-token',
              qrUri: 'otpauth://totp/FIX:demo@fix.com?secret=ABC123',
              manualEntryKey: 'ABC123',
              enrollmentToken: 'enrollment-token',
              expiresAt: '2026-03-12T10:05:00Z',
            },
          }))
        }
        onBootstrapRecovery={async () => ({
          success: true as const,
          bootstrap: {
            rebindToken: 'rebind-token',
            qrUri: 'otpauth://totp/FIX:demo@fix.com?secret=ABC123',
            manualEntryKey: 'ABC123',
            enrollmentToken: 'enrollment-token',
            expiresAt: '2026-03-12T10:05:00Z',
          },
        })}
        onForgotPasswordPress={() => {}}
        onLoginPress={() => {}}
        onRequireEnrollmentRestart={options.onRequireEnrollmentRestart ?? (() => {})}
        onRegisterPress={() => {}}
        onRestartRecovery={() => {}}
      />,
    );
  });

  if (!renderer) {
    throw new Error('Renderer was not created.');
  }

  return renderer;
};

describe('MfaRecoveryScreen', () => {
  it('renders the restart banner passed from the parent auth flow', () => {
    const renderer = renderScreen({
      authStatus: 'anonymous',
      bannerMessage: '복구 단계를 다시 시작해 주세요.',
      bannerTone: 'error',
    });

    expect(findByTestId(renderer.root, 'mfa-recovery-open-forgot-password')).toBeTruthy();
    expect(findText(renderer.root, '복구 단계를 다시 시작해 주세요.')).toHaveLength(1);

    act(() => {
      renderer.unmount();
    });
  });

  it('keeps the authenticated recovery submit wiring on the screen component', async () => {
    const onBootstrapAuthenticated = vi.fn<
      (payload: { currentPassword: string }) => Promise<TotpRebindBootstrapResult>
    >(async () => ({
      success: false as const,
      error: {
        code: 'AUTH-026',
        status: 401,
        message: 'current password mismatch',
      },
    }));
    const renderer = renderScreen({
      authStatus: 'authenticated',
      member: memberFixture,
      mfaRecovery: {
        suggestedEmail: memberFixture.email,
        recoveryProof: null,
        recoveryProofExpiresInSeconds: null,
        bootstrap: null,
      },
      onBootstrapAuthenticated,
    });

    await act(async () => {
      findByTestId(renderer.root, 'mfa-recovery-current-password').props.onChangeText('Wrong1234!');
      await flushPromises();
    });

    await act(async () => {
      findByTestId(renderer.root, 'mfa-recovery-submit').props.onPress();
      await flushPromises();
    });

    expect(onBootstrapAuthenticated).toHaveBeenCalledWith({
      currentPassword: 'Wrong1234!',
    });
    expect(findByTestId(renderer.root, 'mfa-recovery-error').children.join('')).toBe(
      '현재 비밀번호가 일치하지 않습니다. 다시 입력해 주세요.',
    );

    act(() => {
      renderer.unmount();
    });
  });

  it('hands AUTH-009 authenticated recovery failures back to the parent enrollment-restart handler', async () => {
    const onBootstrapAuthenticated = vi.fn<
      (payload: { currentPassword: string }) => Promise<TotpRebindBootstrapResult>
    >(async () => ({
      success: false as const,
      error: {
        code: 'AUTH-009',
        status: 403,
        message: 'totp enrollment required',
        enrollUrl: '/settings/totp/enroll?source=mfa-recovery',
      },
    }));
    const onRequireEnrollmentRestart = vi.fn();
    const renderer = renderScreen({
      authStatus: 'authenticated',
      member: memberFixture,
      mfaRecovery: {
        suggestedEmail: memberFixture.email,
        recoveryProof: null,
        recoveryProofExpiresInSeconds: null,
        bootstrap: null,
      },
      onBootstrapAuthenticated,
      onRequireEnrollmentRestart,
    });

    await act(async () => {
      findByTestId(renderer.root, 'mfa-recovery-current-password').props.onChangeText('Test1234!');
      await flushPromises();
    });

    await act(async () => {
      findByTestId(renderer.root, 'mfa-recovery-submit').props.onPress();
      await flushPromises();
    });

    expect(onRequireEnrollmentRestart).toHaveBeenCalledWith(
      'Google Authenticator 등록이 필요합니다. 다시 로그인하면 인증 앱 등록 단계로 이동합니다.',
    );
    expect(findAllByTestId(renderer.root, 'mfa-recovery-error')).toHaveLength(0);

    act(() => {
      renderer.unmount();
    });
  });
});
