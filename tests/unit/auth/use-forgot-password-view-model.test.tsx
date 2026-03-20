import { act, create } from 'react-test-renderer';

import { PASSWORD_RECOVERY_CHALLENGE_FAIL_CLOSED_EVENT } from '@/auth/recovery-challenge';
import { useForgotPasswordViewModel } from '@/auth/use-forgot-password-view-model';
import type {
  PasswordForgotRequest,
  PasswordRecoveryChallengeRequest,
  PasswordRecoveryChallengeResponse,
} from '@/types/auth';
import type {
  PasswordForgotResult,
  PasswordRecoveryChallengeResult,
} from '@/types/auth-ui';

vi.mock('react-native', () => ({
  AppState: {
    addEventListener: vi.fn(() => ({
      remove: vi.fn(),
    })),
  },
}));

let currentViewModel: ReturnType<typeof useForgotPasswordViewModel> | null = null;

const Harness = ({
  submit,
  submitChallenge,
}: {
  submit: (payload: PasswordForgotRequest) => Promise<PasswordForgotResult>;
  submitChallenge: (
    payload: PasswordRecoveryChallengeRequest,
  ) => Promise<PasswordRecoveryChallengeResult>;
}) => {
  currentViewModel = useForgotPasswordViewModel({ submit, submitChallenge });
  return null;
};

const createLegacyChallenge = (): PasswordRecoveryChallengeResponse => ({
  challengeToken: 'challenge-token',
  challengeType: 'captcha',
  challengeTtlSeconds: 300,
});

const createAcceptedForgotPasswordResult = (): PasswordForgotResult => ({
  success: true,
  response: {
    accepted: true,
    message: 'If the account is eligible, a reset email will be sent.',
    recovery: {
      challengeEndpoint: '/api/v1/auth/password/forgot/challenge',
      challengeMayBeRequired: true,
    },
  },
});

describe('useForgotPasswordViewModel', () => {
  beforeEach(() => {
    currentViewModel = null;
  });

  it('keeps the originally submitted email verbatim when the challenge is solved and submitted later', async () => {
    const submitChallenge = vi.fn(async (): Promise<PasswordRecoveryChallengeResult> => ({
      success: true,
      challenge: createLegacyChallenge(),
    }));
    const submit = vi.fn(async (): Promise<PasswordForgotResult> => createAcceptedForgotPasswordResult());

    await act(async () => {
      create(<Harness submit={submit} submitChallenge={submitChallenge} />);
    });

    expect(currentViewModel).not.toBeNull();
    if (!currentViewModel) {
      throw new Error('view model did not initialize');
    }

    await act(async () => {
      currentViewModel!.updateEmail('  demo@fix.com  ');
    });

    await act(async () => {
      await currentViewModel!.bootstrapChallenge();
    });

    await act(async () => {
      currentViewModel!.updateChallengeAnswer('ready');
    });

    await act(async () => {
      await currentViewModel!.submitForgotPassword();
    });

    expect(submitChallenge).toHaveBeenCalledWith({
      email: '  demo@fix.com  ',
    });
    expect(submit).toHaveBeenCalledWith({
      email: '  demo@fix.com  ',
      challengeToken: 'challenge-token',
      challengeAnswer: 'ready',
    });
  });

  it('reports canonical fail-closed reasons to auth telemetry when bootstrap parsing fails', async () => {
    const telemetry = vi.fn();
    (
      globalThis as typeof globalThis & {
        __FIXYZ_AUTH_TELEMETRY__?: (event: unknown) => void;
      }
    ).__FIXYZ_AUTH_TELEMETRY__ = telemetry;

    const submitChallenge = vi.fn(async (): Promise<PasswordRecoveryChallengeResult> => ({
      success: true,
      challenge: {
        challengeToken: 'challenge-token',
        challengeType: 'proof-of-work',
        challengeTtlSeconds: 300,
        challengeContractVersion: 3,
      } as PasswordRecoveryChallengeResponse,
    }));
    const submit = vi.fn(async (): Promise<PasswordForgotResult> => createAcceptedForgotPasswordResult());

    await act(async () => {
      create(<Harness submit={submit} submitChallenge={submitChallenge} />);
    });

    expect(currentViewModel).not.toBeNull();
    if (!currentViewModel) {
      throw new Error('view model did not initialize');
    }

    try {
      await act(async () => {
        currentViewModel!.updateEmail('demo@fix.com');
      });

      await act(async () => {
        await currentViewModel!.bootstrapChallenge();
      });

      expect(telemetry).toHaveBeenCalledWith({
        name: PASSWORD_RECOVERY_CHALLENGE_FAIL_CLOSED_EVENT,
        payload: {
          reason: 'unknown-version',
          surface: 'forgot-password-mobile',
        },
      });
      expect(currentViewModel!.challengeFailClosedReason).toBe('unknown-version');
    } finally {
      delete (
        globalThis as typeof globalThis & {
          __FIXYZ_AUTH_TELEMETRY__?: (event: unknown) => void;
        }
      ).__FIXYZ_AUTH_TELEMETRY__;
    }
  });

  it('solves a proof-of-work challenge through the forgot-password view model and submits the original email with the solved nonce', async () => {
    const issuedAtEpochMs = Date.now();
    const expiresAtEpochMs = issuedAtEpochMs + 300_000;
    const submitChallenge = vi.fn(async (): Promise<PasswordRecoveryChallengeResult> => ({
      success: true,
      challenge: {
        challengeToken: 'challenge-token-v2',
        challengeType: 'proof-of-work',
        challengeTtlSeconds: 300,
        challengeContractVersion: 2,
        challengeId: 'challenge-id-v2',
        challengeIssuedAtEpochMs: issuedAtEpochMs,
        challengeExpiresAtEpochMs: expiresAtEpochMs,
        challengePayload: {
          kind: 'proof-of-work',
          proofOfWork: {
            algorithm: 'SHA-256',
            seed: 'seed-value',
            difficultyBits: 1,
            answerFormat: 'nonce-decimal',
            inputTemplate: '{seed}:{nonce}',
            inputEncoding: 'utf-8',
            successCondition: {
              type: 'leading-zero-bits',
              minimum: 1,
            },
          },
        },
      },
    }));
    const submit = vi.fn(async (): Promise<PasswordForgotResult> => createAcceptedForgotPasswordResult());

    await act(async () => {
      create(<Harness submit={submit} submitChallenge={submitChallenge} />);
    });

    expect(currentViewModel).not.toBeNull();
    if (!currentViewModel) {
      throw new Error('view model did not initialize');
    }

    await act(async () => {
      currentViewModel!.updateEmail('Demo+Tag@Fix.com');
    });

    await act(async () => {
      await currentViewModel!.bootstrapChallenge();
    });

    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (currentViewModel!.challengeSolveStatus === 'solved') {
        break;
      }

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    expect(currentViewModel!.challengeState).toMatchObject({
      kind: 'proof-of-work',
      challengeToken: 'challenge-token-v2',
      email: 'Demo+Tag@Fix.com',
    });
    expect(currentViewModel!.challengeSolveStatus).toBe('solved');
    expect(currentViewModel!.challengeAnswer).toMatch(/^\d+$/);

    await act(async () => {
      await currentViewModel!.submitForgotPassword();
    });

    expect(submit).toHaveBeenCalledWith({
      email: 'Demo+Tag@Fix.com',
      challengeToken: 'challenge-token-v2',
      challengeAnswer: expect.stringMatching(/^\d+$/),
    });
  });
});
