import type { ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

import { useMfaRecoveryRebindViewModel } from '@/auth/use-mfa-recovery-rebind-view-model';
import type { TotpRebindBootstrap } from '@/types/auth';
import type { MfaRecoveryRebindConfirmationResult } from '@/types/auth-ui';

const bootstrapFixture: TotpRebindBootstrap = {
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

interface HarnessProps {
  submit: () => Promise<MfaRecoveryRebindConfirmationResult>;
  restartRecovery: (options?: {
    bannerMessage?: string | null;
    bannerTone?: 'info' | 'error' | 'success';
  }) => void;
}

const createHarness = (props: HarnessProps) => {
  let latest: ReturnType<typeof useMfaRecoveryRebindViewModel> | null = null;
  let renderer: ReactTestRenderer | null = null;

  const Harness = (input: HarnessProps) => {
    latest = useMfaRecoveryRebindViewModel({
      bootstrap: bootstrapFixture,
      restartRecovery: input.restartRecovery,
      submit: async () => input.submit(),
    });
    return null;
  };

  act(() => {
    renderer = create(<Harness {...props} />);
  });

  return {
    getLatest: () => {
      if (!latest) {
        throw new Error('View model is not ready.');
      }

      return latest;
    },
    unmount: () => {
      act(() => {
        renderer?.unmount();
      });
    },
  };
};

describe('useMfaRecoveryRebindViewModel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('restarts recovery with an error banner when the rebind step is stale', async () => {
    const restartRecovery = vi.fn();
    const submit = vi.fn<() => Promise<MfaRecoveryRebindConfirmationResult>>(async () => ({
      success: false as const,
      error: {
        code: 'AUTH-020',
        status: 409,
        message: 'mfa recovery proof already consumed',
      },
    }));
    const harness = createHarness({
      submit,
      restartRecovery,
    });

    act(() => {
      harness.getLatest().updateOtpCode('123456');
    });

    await act(async () => {
      await harness.getLatest().submitRecoveryConfirmation();
      await flushPromises();
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(restartRecovery).toHaveBeenCalledWith({
      bannerMessage: '이미 사용된 복구 단계입니다. 비밀번호 재설정을 다시 진행해 주세요.',
      bannerTone: 'error',
    });
    harness.unmount();
  });

  it('keeps confirmation local when the OTP code is malformed', async () => {
    const submit = vi.fn<() => Promise<MfaRecoveryRebindConfirmationResult>>(async () => ({
      success: true as const,
      response: {
        rebindCompleted: true,
        reauthRequired: true,
      },
    }));
    const harness = createHarness({
      submit,
      restartRecovery: vi.fn(),
    });

    act(() => {
      harness.getLatest().updateOtpCode('12');
    });

    await act(async () => {
      await harness.getLatest().submitRecoveryConfirmation();
      await flushPromises();
    });

    expect(submit).not.toHaveBeenCalled();
    expect(harness.getLatest().errorMessage).toBe(
      '현재 인증 코드는 숫자 6자리로 입력해 주세요.',
    );
    harness.unmount();
  });

  it('ignores stale confirmation completions after the screen unmounts', async () => {
    let resolveSubmit!: (value: MfaRecoveryRebindConfirmationResult) => void;
    const submit = vi.fn<() => Promise<MfaRecoveryRebindConfirmationResult>>(
      () => new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    const restartRecovery = vi.fn();
    const harness = createHarness({
      submit,
      restartRecovery,
    });

    act(() => {
      harness.getLatest().updateOtpCode('123456');
    });

    await act(async () => {
      void harness.getLatest().submitRecoveryConfirmation();
      await flushPromises();
    });

    harness.unmount();

    await act(async () => {
      resolveSubmit({
        success: false,
        error: {
          code: 'AUTH-020',
          status: 409,
          message: 'mfa recovery proof already consumed',
        },
      });
      await flushPromises();
    });

    expect(restartRecovery).not.toHaveBeenCalled();
  });
});
