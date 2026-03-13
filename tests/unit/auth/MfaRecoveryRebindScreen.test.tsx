import type { ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

import { MfaRecoveryRebindScreen } from '@/screens/auth/MfaRecoveryRebindScreen';
import type { MfaRecoveryRebindConfirmationResult } from '@/types/auth-ui';

const bootstrapFixture = {
  rebindToken: 'rebind-token',
  qrUri: 'otpauth://totp/FIX:demo@fix.com?secret=ABC123',
  manualEntryKey: 'ABC123',
  enrollmentToken: 'enrollment-token',
  expiresAt: '2026-03-12T10:05:00Z',
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

describe('MfaRecoveryRebindScreen', () => {
  it('wires stale rebind failures back into the parent restart handler', async () => {
    const onRestartRecovery = vi.fn();
    const onSubmit = vi.fn<
      () => Promise<MfaRecoveryRebindConfirmationResult>
    >(async () => ({
      success: false as const,
      error: {
        code: 'AUTH-020',
        status: 409,
        message: 'mfa recovery proof already consumed',
      },
    }));
    let renderer: ReactTestRenderer | null = null;

    act(() => {
      renderer = create(
        <MfaRecoveryRebindScreen
          bootstrap={bootstrapFixture}
          onLoginPress={() => {}}
          onRegisterPress={() => {}}
          onRestartRecovery={onRestartRecovery}
          onSubmit={async () => onSubmit()}
        />,
      );
    });

    if (!renderer) {
      throw new Error('Renderer was not created.');
    }
    const mountedRenderer = renderer as ReactTestRenderer;

    await act(async () => {
      findByTestId(mountedRenderer.root, 'mfa-recovery-code').props.onChangeText('123456');
      await flushPromises();
    });

    await act(async () => {
      findByTestId(mountedRenderer.root, 'mfa-recovery-confirm-submit').props.onPress();
      await flushPromises();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onRestartRecovery).toHaveBeenCalledWith({
      bannerMessage: '이미 사용된 복구 단계입니다. 비밀번호 재설정을 다시 진행해 주세요.',
      bannerTone: 'error',
    });

    act(() => {
      mountedRenderer.unmount();
    });
  });
});
