import {
  getRecoveryChallengeFailClosedMessage,
  isPasswordRecoveryChallengeTrustedForSolve,
  parsePasswordRecoveryChallengeResponse,
  solvePasswordRecoveryProofOfWork,
} from '@/auth/recovery-challenge';

describe('recovery challenge helper', () => {
  it('parses the legacy bootstrap shape without challenge contract version fields', () => {
    const result = parsePasswordRecoveryChallengeResponse(
      {
        challengeToken: 'legacy-token',
        challengeType: 'captcha',
        challengeTtlSeconds: 300,
      },
      'demo@fix.com',
      1_700_000_000_000,
    );

    expect('error' in result).toBe(false);
    if ('challenge' in result) {
      expect(result.challenge).toMatchObject({
        kind: 'legacy',
        email: 'demo@fix.com',
        challengeToken: 'legacy-token',
        challengeType: 'captcha',
        challengeTtlSeconds: 300,
        receivedAtEpochMs: 1_700_000_000_000,
      });
    }
  });

  it('parses the proof-of-work bootstrap contract and keeps the canonical payload fields', () => {
    const result = parsePasswordRecoveryChallengeResponse(
      {
        challengeToken: 'challenge-token',
        challengeType: 'proof-of-work',
        challengeTtlSeconds: 300,
        challengeContractVersion: 2,
        challengeId: 'challenge-id',
        challengeIssuedAtEpochMs: 1_700_000_000_000,
        challengeExpiresAtEpochMs: 1_700_000_300_000,
        challengePayload: {
          kind: 'proof-of-work',
          proofOfWork: {
            algorithm: 'SHA-256',
            seed: 'seed-value',
            difficultyBits: 4,
            answerFormat: 'nonce-decimal',
            inputTemplate: '{seed}:{nonce}',
            inputEncoding: 'utf-8',
            successCondition: {
              type: 'leading-zero-bits',
              minimum: 4,
            },
          },
        },
      },
      'demo@fix.com',
      1_700_000_000_100,
    );

    expect('error' in result).toBe(false);
    if ('error' in result || result.challenge.kind !== 'proof-of-work') {
      throw new Error('expected a proof-of-work challenge');
    }

    expect(result.challenge).toMatchObject({
      kind: 'proof-of-work',
      challengeContractVersion: 2,
      challengeId: 'challenge-id',
      challengeType: 'proof-of-work',
      challengeToken: 'challenge-token',
      challengeTtlSeconds: 300,
      email: 'demo@fix.com',
    });
    expect(result.challenge.challengePayload).toMatchObject({
      kind: 'proof-of-work',
      proofOfWork: {
        algorithm: 'SHA-256',
        seed: 'seed-value',
        difficultyBits: 4,
        answerFormat: 'nonce-decimal',
        inputTemplate: '{seed}:{nonce}',
        inputEncoding: 'utf-8',
        successCondition: {
          type: 'leading-zero-bits',
          minimum: 4,
        },
      },
    });
  });

  it('fails closed for mixed-shape and unsupported contract versions', () => {
    expect(
      parsePasswordRecoveryChallengeResponse(
        {
          challengeToken: 'challenge-token',
          challengeType: 'captcha',
          challengeTtlSeconds: 300,
          challengeContractVersion: 2,
        },
        'demo@fix.com',
      ),
    ).toEqual({
      error: {
        reason: 'mixed-shape',
        message: getRecoveryChallengeFailClosedMessage('mixed-shape'),
      },
    });

    expect(
      parsePasswordRecoveryChallengeResponse(
        {
          challengeToken: 'challenge-token',
          challengeType: 'proof-of-work',
          challengeTtlSeconds: 300,
          challengeContractVersion: 3,
        },
        'demo@fix.com',
      ),
    ).toEqual({
      error: {
        reason: 'unknown-version',
        message: getRecoveryChallengeFailClosedMessage('unknown-version'),
      },
    });
  });

  it('treats near-expiry proof-of-work challenges as untrusted for solving', () => {
    const result = parsePasswordRecoveryChallengeResponse(
      {
        challengeToken: 'challenge-token',
        challengeType: 'proof-of-work',
        challengeTtlSeconds: 300,
        challengeContractVersion: 2,
        challengeId: 'challenge-id',
        challengeIssuedAtEpochMs: 1_700_000_000_000,
        challengeExpiresAtEpochMs: 1_700_000_300_000,
        challengePayload: {
          kind: 'proof-of-work',
          proofOfWork: {
            algorithm: 'SHA-256',
            seed: 'seed-value',
            difficultyBits: 2,
            answerFormat: 'nonce-decimal',
            inputTemplate: '{seed}:{nonce}',
            inputEncoding: 'utf-8',
            successCondition: {
              type: 'leading-zero-bits',
              minimum: 2,
            },
          },
        },
      },
      'demo@fix.com',
      1_700_000_000_100,
    );

    if ('error' in result || result.challenge.kind !== 'proof-of-work') {
      throw new Error('expected a proof-of-work challenge');
    }

    expect(isPasswordRecoveryChallengeTrustedForSolve(result.challenge, 1_700_000_294_500)).toBe(
      true,
    );
    expect(
      isPasswordRecoveryChallengeTrustedForSolve(result.challenge, 1_700_000_295_500),
    ).toBe(false);
  });

  it('solves a simple proof-of-work challenge into a decimal nonce', async () => {
    const nonce = await solvePasswordRecoveryProofOfWork({
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
    });

    expect(nonce).toMatch(/^\d+$/);
  });
});
