import type {
  PasswordRecoveryChallengeProofOfWorkPayload,
} from '../types/auth';

export const RECOVERY_CHALLENGE_FAIL_CLOSED_MESSAGES = {
  'unknown-version': '보안 확인 정보를 새로 불러와 다시 진행해 주세요.',
  'kind-mismatch': '보안 확인 정보를 새로 불러와 다시 진행해 주세요.',
  'malformed-payload': '보안 확인 정보를 새로 불러와 다시 진행해 주세요.',
  'mixed-shape': '보안 확인 정보를 새로 불러와 다시 진행해 주세요.',
  'clock-skew': '기기 시간 차이로 보안 확인을 이어갈 수 없습니다. 보안 확인을 새로 불러와 주세요.',
  'validity-untrusted': '보안 확인 유효성을 다시 확인할 수 없어 새 보안 확인이 필요합니다.',
} as const;

export type RecoveryChallengeFailClosedReason = keyof typeof RECOVERY_CHALLENGE_FAIL_CLOSED_MESSAGES;

export interface RecoveryChallengeFailClosedContext {
  challengeIssuedAtEpochMs?: number;
}

export const PASSWORD_RECOVERY_CHALLENGE_FAIL_CLOSED_EVENT =
  'password-recovery-challenge-fail-closed';

export type RecoveryChallengeFailClosedTelemetryEvent = {
  name: typeof PASSWORD_RECOVERY_CHALLENGE_FAIL_CLOSED_EVENT;
  payload: {
    reason: RecoveryChallengeFailClosedReason;
    surface: 'forgot-password-mobile';
    challengeIssuedAtEpochMs?: number;
  };
};

export type RecoveryChallengeFailClosedTelemetrySink = (
  event: RecoveryChallengeFailClosedTelemetryEvent,
) => void;

export type RecoveryChallengeFailClosedTelemetryTransport = (
  event: RecoveryChallengeFailClosedTelemetryEvent,
) => void | Promise<void>;

const defaultRecoveryChallengeFailClosedTelemetrySink: RecoveryChallengeFailClosedTelemetrySink = (
  event,
) => {
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn('password recovery challenge fail-closed', event.payload);
  }
};

export interface RecoveryChallengeParseError {
  reason: RecoveryChallengeFailClosedReason;
  message: string;
  challengeIssuedAtEpochMs?: number;
}

interface RecoveryChallengeParseSuccess {
  challenge: PasswordRecoveryChallengeSession;
}

export type RecoveryChallengeParseResult =
  | RecoveryChallengeParseSuccess
  | {
      error: RecoveryChallengeParseError;
    };

export interface PasswordRecoveryChallengeBaseSession {
  email: string;
  challengeToken: string;
  challengeType: string;
  challengeTtlSeconds: number;
  receivedAtEpochMs: number;
}

export interface PasswordRecoveryLegacyChallengeSession
  extends PasswordRecoveryChallengeBaseSession {
  kind: 'legacy';
}

export interface PasswordRecoveryProofOfWorkChallengeSession
  extends PasswordRecoveryChallengeBaseSession {
  kind: 'proof-of-work';
  challengeContractVersion: 2;
  challengeId: string;
  challengeIssuedAtEpochMs: number;
  challengeExpiresAtEpochMs: number;
  challengeType: 'proof-of-work';
  challengePayload: PasswordRecoveryChallengeProofOfWorkPayload;
  solveProgress: number;
  solveStatus: 'idle' | 'solving' | 'solved' | 'failed';
  challengeAnswer: string | null;
  failClosedReason: RecoveryChallengeFailClosedReason | null;
}

export type PasswordRecoveryChallengeSession =
  | PasswordRecoveryLegacyChallengeSession
  | PasswordRecoveryProofOfWorkChallengeSession;

interface RecordLike {
  [key: string]: unknown;
}

const isRecord = (value: unknown): value is RecordLike =>
  typeof value === 'object' && value !== null;

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const hasOnlyExactKeys = (value: RecordLike, allowedKeys: readonly string[]) =>
  Object.keys(value).every((key) => allowedKeys.includes(key))
  && allowedKeys.every((key) => key in value);

const hasAnyV2Fields = (value: RecordLike) =>
  [
    'challengeContractVersion',
    'challengeId',
    'challengeIssuedAtEpochMs',
    'challengeExpiresAtEpochMs',
    'challengePayload',
  ].some((key) => key in value);

const hasLegacyShape = (value: RecordLike) =>
  hasOnlyExactKeys(value, ['challengeToken', 'challengeType', 'challengeTtlSeconds']);

const createFailure = (
  reason: RecoveryChallengeFailClosedReason,
  context: RecoveryChallengeFailClosedContext = {},
): RecoveryChallengeParseError => {
  const failure: RecoveryChallengeParseError = {
    reason,
    message: RECOVERY_CHALLENGE_FAIL_CLOSED_MESSAGES[reason],
  };
  if (typeof context.challengeIssuedAtEpochMs === 'number') {
    failure.challengeIssuedAtEpochMs = context.challengeIssuedAtEpochMs;
  }
  return failure;
};

const resolveChallengeIssuedAtEpochMs = (
  value: RecordLike,
) => isFiniteNumber(value.challengeIssuedAtEpochMs)
  ? Math.floor(value.challengeIssuedAtEpochMs)
  : undefined;

const normalizeTtlSeconds = (
  value: unknown,
  issuedAtEpochMs: number,
  expiresAtEpochMs: number,
) => {
  if (isFiniteNumber(value) && value > 0) {
    return Math.floor(value);
  }

  return Math.max(0, Math.round((expiresAtEpochMs - issuedAtEpochMs) / 1000));
};

const parseLegacyChallenge = (
  value: RecordLike,
  email: string,
  receivedAtEpochMs: number,
): RecoveryChallengeParseResult => {
  const challengeToken = value.challengeToken;
  const challengeType = value.challengeType;
  const challengeTtlSeconds = value.challengeTtlSeconds;

  if (
    !isString(challengeToken)
    || !isString(challengeType)
    || !isFiniteNumber(challengeTtlSeconds)
  ) {
    return {
      error: createFailure('malformed-payload'),
    };
  }

  return {
    challenge: {
      kind: 'legacy',
      email,
      challengeToken,
      challengeType,
      challengeTtlSeconds: Math.floor(challengeTtlSeconds),
      receivedAtEpochMs,
    },
  };
};

const parseProofOfWorkPayload = (
  value: unknown,
): { payload: PasswordRecoveryChallengeProofOfWorkPayload } | { error: RecoveryChallengeParseError } => {
  if (!isRecord(value) || value.kind !== 'proof-of-work' || !isRecord(value.proofOfWork)) {
    return {
      error: createFailure('kind-mismatch'),
    };
  }

  const proofOfWork = value.proofOfWork;
  const successCondition = proofOfWork.successCondition;
  const hasValidSuccessCondition =
    isRecord(successCondition) && hasOnlyExactKeys(successCondition, ['type', 'minimum']);
  const difficultyBits = proofOfWork.difficultyBits;
  const minimum = hasValidSuccessCondition ? successCondition.minimum : undefined;
  const successConditionType = hasValidSuccessCondition ? successCondition.type : undefined;

  if (
    !hasOnlyExactKeys(value, ['kind', 'proofOfWork'])
    || !hasOnlyExactKeys(proofOfWork, [
      'algorithm',
      'seed',
      'difficultyBits',
      'answerFormat',
      'inputTemplate',
      'inputEncoding',
      'successCondition',
    ])
    || !hasValidSuccessCondition
    || proofOfWork.algorithm !== 'SHA-256'
    || !isString(proofOfWork.seed)
    || !isFiniteNumber(difficultyBits)
    || !Number.isInteger(difficultyBits)
    || difficultyBits <= 0
    || proofOfWork.answerFormat !== 'nonce-decimal'
    || proofOfWork.inputTemplate !== '{seed}:{nonce}'
    || proofOfWork.inputEncoding !== 'utf-8'
    || successConditionType !== 'leading-zero-bits'
    || !isFiniteNumber(minimum)
    || minimum !== difficultyBits
  ) {
    return {
      error: createFailure('malformed-payload'),
    };
  }

  return {
    payload: {
      kind: 'proof-of-work',
      proofOfWork: {
        algorithm: 'SHA-256',
        seed: proofOfWork.seed,
        difficultyBits,
        answerFormat: 'nonce-decimal',
        inputTemplate: '{seed}:{nonce}',
        inputEncoding: 'utf-8',
        successCondition: {
          type: 'leading-zero-bits',
          minimum: difficultyBits,
        },
      },
    },
  };
};

const parseProofOfWorkChallenge = (
  value: RecordLike,
  email: string,
  receivedAtEpochMs: number,
): RecoveryChallengeParseResult => {
  const challengeToken = value.challengeToken;
  const challengeType = value.challengeType;
  const challengeTtlSeconds = value.challengeTtlSeconds;
  const challengeId = value.challengeId;
  const challengeIssuedAtEpochMs = value.challengeIssuedAtEpochMs;
  const challengeExpiresAtEpochMs = value.challengeExpiresAtEpochMs;

  if (challengeType !== 'proof-of-work') {
    return {
      error: createFailure(
        isString(challengeType) ? 'mixed-shape' : 'malformed-payload',
        {
          challengeIssuedAtEpochMs: resolveChallengeIssuedAtEpochMs(value),
        },
      ),
      };
  }

  if (
    !isString(challengeToken)
    || !isString(challengeId)
    || !isFiniteNumber(challengeIssuedAtEpochMs)
    || !isFiniteNumber(challengeExpiresAtEpochMs)
    || challengeExpiresAtEpochMs <= challengeIssuedAtEpochMs
    || !(
      hasOnlyExactKeys(value, [
        'challengeToken',
        'challengeType',
        'challengeTtlSeconds',
        'challengeContractVersion',
        'challengeId',
        'challengeIssuedAtEpochMs',
        'challengeExpiresAtEpochMs',
        'challengePayload',
      ])
      || hasOnlyExactKeys(value, [
        'challengeToken',
        'challengeType',
        'challengeContractVersion',
        'challengeId',
        'challengeIssuedAtEpochMs',
        'challengeExpiresAtEpochMs',
        'challengePayload',
      ])
    )
  ) {
    return {
      error: createFailure('malformed-payload', {
        challengeIssuedAtEpochMs: resolveChallengeIssuedAtEpochMs(value),
      }),
      };
  }

  if (Math.abs(receivedAtEpochMs - challengeIssuedAtEpochMs) > 30_000) {
    return {
      error: createFailure('clock-skew', {
        challengeIssuedAtEpochMs,
      }),
      };
  }

  const payloadResult = parseProofOfWorkPayload(value.challengePayload);
  if ('error' in payloadResult) {
    return payloadResult;
  }

  return {
    challenge: {
      kind: 'proof-of-work',
      email,
      challengeToken,
      challengeType: 'proof-of-work',
      challengeTtlSeconds: normalizeTtlSeconds(
        challengeTtlSeconds,
        challengeIssuedAtEpochMs,
        challengeExpiresAtEpochMs,
      ),
      challengeContractVersion: 2,
      challengeId,
      challengeIssuedAtEpochMs,
      challengeExpiresAtEpochMs,
      challengePayload: payloadResult.payload,
      receivedAtEpochMs,
      solveProgress: 0,
      solveStatus: 'idle',
      challengeAnswer: null,
      failClosedReason: null,
    },
  };
};

export const getRecoveryChallengeFailClosedMessage = (
  reason: RecoveryChallengeFailClosedReason,
) => RECOVERY_CHALLENGE_FAIL_CLOSED_MESSAGES[reason];

export const reportPasswordRecoveryChallengeFailClosed = (
  reason: RecoveryChallengeFailClosedReason,
  context: RecoveryChallengeFailClosedContext = {},
  options?: {
    transport?: RecoveryChallengeFailClosedTelemetryTransport;
  },
) => {
  const telemetryPayload: RecoveryChallengeFailClosedTelemetryEvent['payload'] = {
    reason,
    surface: 'forgot-password-mobile',
  };
  if (typeof context.challengeIssuedAtEpochMs === 'number') {
    telemetryPayload.challengeIssuedAtEpochMs = context.challengeIssuedAtEpochMs;
  }

  const telemetryEvent: RecoveryChallengeFailClosedTelemetryEvent = {
    name: PASSWORD_RECOVERY_CHALLENGE_FAIL_CLOSED_EVENT,
    payload: telemetryPayload,
  };

  const globalTelemetrySink = (
    globalThis as typeof globalThis & {
      __FIXYZ_AUTH_TELEMETRY__?: RecoveryChallengeFailClosedTelemetrySink;
    }
  ).__FIXYZ_AUTH_TELEMETRY__;

  if (globalTelemetrySink) {
    try {
      globalTelemetrySink(telemetryEvent);
    } catch {
      // Telemetry must never break the recovery flow.
    }
    return;
  }

  if (options?.transport) {
    void Promise.resolve(
      options.transport(telemetryEvent),
    ).catch(() => undefined);
    return;
  }

  try {
    defaultRecoveryChallengeFailClosedTelemetrySink(telemetryEvent);
  } catch {
    // Telemetry must never break the recovery flow.
  }
};

export const parsePasswordRecoveryChallengeResponse = (
  value: unknown,
  email: string,
  receivedAtEpochMs = Date.now(),
): RecoveryChallengeParseResult => {
  if (!isRecord(value)) {
    return {
      error: createFailure('malformed-payload'),
    };
  }

  if ('challengeContractVersion' in value) {
    if (value.challengeContractVersion !== 2) {
      return {
        error: createFailure('unknown-version', {
          challengeIssuedAtEpochMs: resolveChallengeIssuedAtEpochMs(value),
        }),
      };
    }

    return parseProofOfWorkChallenge(value, email, receivedAtEpochMs);
  }

  if (hasAnyV2Fields(value)) {
    return {
      error: createFailure('mixed-shape', {
        challengeIssuedAtEpochMs: resolveChallengeIssuedAtEpochMs(value),
      }),
      };
  }

  if (hasLegacyShape(value)) {
    return parseLegacyChallenge(value, email, receivedAtEpochMs);
  }

  return {
    error: createFailure('malformed-payload'),
  };
};

export const isPasswordRecoveryProofOfWorkChallenge = (
  challenge: PasswordRecoveryChallengeSession | null,
): challenge is PasswordRecoveryProofOfWorkChallengeSession =>
  challenge?.kind === 'proof-of-work';

export const isPasswordRecoveryChallengeTrustedForSolve = (
  challenge: PasswordRecoveryProofOfWorkChallengeSession,
  receivedAtEpochMs = Date.now(),
): boolean => challenge.challengeExpiresAtEpochMs - receivedAtEpochMs > 5_000;

export const solvePasswordRecoveryProofOfWork = async (
  proofOfWork: PasswordRecoveryChallengeProofOfWorkPayload['proofOfWork'],
  options?: {
    onProgress?: (progress: number) => void;
    shouldAbort?: () => boolean;
    startNonce?: number;
    batchSize?: number;
  },
): Promise<string> => {
  const encoder = new TextEncoder();
  const batchSize = options?.batchSize ?? 256;
  const startNonce = options?.startNonce ?? 0;
  let nonce = startNonce;
  let attempts = 0;

  options?.onProgress?.(0);

  while (true) {
    if (options?.shouldAbort?.()) {
      throw new Error('recovery-challenge-solve-aborted');
    }

    const digest = await sha256Hex(encoder.encode(`${proofOfWork.seed}:${nonce}`));
    if (hasLeadingZeroBits(digest, proofOfWork.difficultyBits)) {
      options?.onProgress?.(100);
      return String(nonce);
    }

    nonce += 1;
    attempts += 1;

    if (attempts % batchSize === 0) {
      const expectedAttempts = Math.max(1, 2 ** Math.min(proofOfWork.difficultyBits, 20));
      const progress = Math.min(99, Math.floor((attempts / expectedAttempts) * 100));
      options?.onProgress?.(progress);
      await yieldToEventLoop();
    }
  }
};

const yieldToEventLoop = async () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

const hasLeadingZeroBits = (hexDigest: string, minimumBits: number) => {
  let remainingBits = minimumBits;

  for (let index = 0; index < hexDigest.length && remainingBits > 0; index += 1) {
    const nibble = Number.parseInt(hexDigest[index] ?? '0', 16);
    if (Number.isNaN(nibble)) {
      return false;
    }

    if (remainingBits >= 4) {
      if (nibble !== 0) {
        return false;
      }
      remainingBits -= 4;
      continue;
    }

    const threshold = 1 << (4 - remainingBits);
    return nibble < threshold;
  }

  return remainingBits <= 0;
};

const sha256Hex = async (bytes: Uint8Array) => {
  const cryptoApi = globalThis.crypto as {
    subtle?: {
      digest: (algorithm: string, data: Uint8Array) => Promise<ArrayBuffer>;
    };
  } | undefined;
  if (cryptoApi?.subtle) {
    const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  }

  return sha256HexFallback(bytes);
};

const sha256HexFallback = (message: Uint8Array) => {
  const words = bytesToWords(message);
  const hash = computeSha256(words);

  return Array.from(hash)
    .map((value) => value.toString(16).padStart(8, '0'))
    .join('');
};

const bytesToWords = (bytes: Uint8Array) => {
  const words = new Uint32Array(((bytes.length + 9 + 63) >> 6) << 4);
  for (let index = 0; index < bytes.length; index += 1) {
    words[index >> 2] |= bytes[index] << ((3 - (index & 3)) << 3);
  }
  words[bytes.length >> 2] |= 0x80 << ((3 - (bytes.length & 3)) << 3);
  const bitLength = bytes.length * 8;
  words[words.length - 2] = Math.floor(bitLength / 0x100000000);
  words[words.length - 1] = bitLength >>> 0;
  return words;
};

const computeSha256 = (messageWords: Uint32Array) => {
  const hash = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < messageWords.length; offset += 16) {
    for (let index = 0; index < 16; index += 1) {
      w[index] = messageWords[offset + index] ?? 0;
    }

    for (let index = 16; index < 64; index += 1) {
      const s0 =
        rightRotate(w[index - 15], 7) ^ rightRotate(w[index - 15], 18) ^ (w[index - 15] >>> 3);
      const s1 =
        rightRotate(w[index - 2], 17) ^ rightRotate(w[index - 2], 19) ^ (w[index - 2] >>> 10);
      w[index] = (w[index - 16] + s0 + w[index - 7] + s1) >>> 0;
    }

    let a = hash[0];
    let b = hash[1];
    let c = hash[2];
    let d = hash[3];
    let e = hash[4];
    let f = hash[5];
    let g = hash[6];
    let h = hash[7];

    for (let index = 0; index < 64; index += 1) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[index] + w[index]) >>> 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return hash;
};

const rightRotate = (value: number, shift: number) =>
  (value >>> shift) | (value << (32 - shift));

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
