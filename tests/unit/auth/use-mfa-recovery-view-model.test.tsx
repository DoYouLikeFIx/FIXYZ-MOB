import type { ReactTestRenderer } from 'react-test-renderer';
import { act, create } from 'react-test-renderer';

import { useMfaRecoveryViewModel } from '@/auth/use-mfa-recovery-view-model';
import type { MfaRecoveryState } from '@/auth/auth-flow-view-model';
import type { AuthStatus } from '@/store/auth-store';
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

const mfaRecoveryProofFixture: MfaRecoveryState = {
  suggestedEmail: 'demo@fix.com',
  recoveryProof: 'recovery-proof-token',
  recoveryProofExpiresInSeconds: 600,
  bootstrap: null,
};

const createDeferred = <T,>() => {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;

  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise,
  };
};

const flushPromises = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

interface HarnessProps {
  authStatus: AuthStatus;
  member: Member | null;
  mfaRecovery: MfaRecoveryState | null;
  bootstrapAuthenticated: (payload: {
    currentPassword: string;
  }) => Promise<TotpRebindBootstrapResult>;
  bootstrapRecovery: () => Promise<TotpRebindBootstrapResult>;
  restartRecovery: () => void;
  restartEnrollmentLogin: (message: string) => void;
}

const createHarness = (props: HarnessProps) => {
  let latest: ReturnType<typeof useMfaRecoveryViewModel> | null = null;
  let renderer: ReactTestRenderer | null = null;

  const Harness = (input: HarnessProps) => {
    latest = useMfaRecoveryViewModel(input);
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

describe('useMfaRecoveryViewModel', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('surfaces AUTH-026 guidance for authenticated recovery bootstrap mismatches', async () => {
    const bootstrapAuthenticated = vi.fn<
      (payload: { currentPassword: string }) => Promise<TotpRebindBootstrapResult>
    >(async () => ({
      success: false as const,
      error: {
        code: 'AUTH-026',
        status: 401,
        message: 'current password mismatch',
      },
    }));
    const bootstrapRecovery = vi.fn<() => Promise<TotpRebindBootstrapResult>>(async () => ({
      success: false as const,
      error: new Error('unused'),
    }));
    const restartRecovery = vi.fn();
    const harness = createHarness({
      authStatus: 'authenticated',
      member: memberFixture,
      mfaRecovery: {
        suggestedEmail: memberFixture.email,
        recoveryProof: null,
        recoveryProofExpiresInSeconds: null,
        bootstrap: null,
      },
      bootstrapAuthenticated,
      bootstrapRecovery,
      restartRecovery,
      restartEnrollmentLogin: vi.fn(),
    });

    act(() => {
      harness.getLatest().updateCurrentPassword('Wrong1234!');
    });

    await act(async () => {
      await harness.getLatest().submitAuthenticatedRecovery();
      await flushPromises();
    });

    expect(bootstrapAuthenticated).toHaveBeenCalledWith({
      currentPassword: 'Wrong1234!',
    });
    expect(harness.getLatest().errorMessage).toBe(
      '현재 비밀번호가 일치하지 않습니다. 다시 입력해 주세요.',
    );
    expect(restartRecovery).not.toHaveBeenCalled();
    harness.unmount();
  });

  it('does not loop recovery proof bootstrap failures until the user retries', async () => {
    const firstBootstrap = createDeferred<TotpRebindBootstrapResult>();
    const secondBootstrap = createDeferred<TotpRebindBootstrapResult>();
    const bootstrapRecovery = vi
      .fn<() => Promise<TotpRebindBootstrapResult>>()
      .mockImplementationOnce(() => firstBootstrap.promise)
      .mockImplementationOnce(() => secondBootstrap.promise);
    const harness = createHarness({
      authStatus: 'anonymous',
      member: null,
      mfaRecovery: mfaRecoveryProofFixture,
      bootstrapAuthenticated: vi.fn<
        (payload: { currentPassword: string }) => Promise<TotpRebindBootstrapResult>
      >(async () => ({
        success: false as const,
        error: new Error('unused'),
      })),
      bootstrapRecovery,
      restartRecovery: vi.fn(),
      restartEnrollmentLogin: vi.fn(),
    });

    expect(bootstrapRecovery).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstBootstrap.resolve({
        success: false,
        error: {
          code: 'AUTH-018',
          status: 401,
          message: 'login token expired or invalid',
        },
      });
      await flushPromises();
    });

    await act(async () => {
      await flushPromises();
    });

    expect(bootstrapRecovery).toHaveBeenCalledTimes(1);
    expect(harness.getLatest().errorMessage).toBe(
      '인증 단계가 만료되었습니다. 이메일과 비밀번호부터 다시 로그인해 주세요.',
    );

    await act(async () => {
      harness.getLatest().retryProofBootstrap();
      await flushPromises();
    });

    expect(bootstrapRecovery).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondBootstrap.resolve({
        success: false,
        error: {
          code: 'AUTH-018',
          status: 401,
          message: 'login token expired or invalid',
        },
      });
      await flushPromises();
    });

    harness.unmount();
  });

  it('ignores recovery proof completions that arrive after the screen unmounts', async () => {
    const bootstrapRecovery = createDeferred<TotpRebindBootstrapResult>();
    const restartRecovery = vi.fn();
    const harness = createHarness({
      authStatus: 'anonymous',
      member: null,
      mfaRecovery: mfaRecoveryProofFixture,
      bootstrapAuthenticated: vi.fn<
        (payload: { currentPassword: string }) => Promise<TotpRebindBootstrapResult>
      >(async () => ({
        success: false as const,
        error: new Error('unused'),
      })),
      bootstrapRecovery: () => bootstrapRecovery.promise,
      restartRecovery,
      restartEnrollmentLogin: vi.fn(),
    });

    expect(restartRecovery).not.toHaveBeenCalled();

    harness.unmount();

    await act(async () => {
      bootstrapRecovery.resolve({
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
