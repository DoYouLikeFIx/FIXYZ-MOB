#!/usr/bin/env node

import crypto from 'node:crypto';
import http from 'node:http';

const args = process.argv.slice(2);
const portFlagIndex = args.indexOf('--port');
const port =
  portFlagIndex >= 0 && args[portFlagIndex + 1]
    ? Number(args[portFlagIndex + 1])
    : Number(process.env.PORT ?? 8080);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid port: ${port}`);
}

const VALID_PASSWORD = 'Test1234!';
let nextOrderId = 1;

const notificationItemsBySession = new Map();
const portfolioFixturesByAccountId = new Map();
const positionQueryCountsByKey = new Map();

const createDefaultNotificationItems = () => [
  {
    notificationId: 101,
    channel: 'ORDER_SESSION',
    message: '초기 주문 알림이 도착했습니다.',
    delivered: true,
    read: false,
    readAt: null,
  },
  {
    notificationId: 99,
    channel: 'ORDER_SESSION',
    message: '이전 주문 결과가 반영되었습니다.',
    delivered: true,
    read: true,
    readAt: '2026-03-17T00:00:00.000Z',
  },
];

const getNotificationItemsForSession = (sessionId) => {
  const existing = notificationItemsBySession.get(sessionId);

  if (existing) {
    return existing;
  }

  const created = createDefaultNotificationItems();
  notificationItemsBySession.set(sessionId, created);
  return created;
};

const normalizeIdentifier = (value) => value.trim().toLowerCase();

const scriptedLoginErrors = new Map([
  [
    'locked@fix.com',
    {
      status: 401,
      code: 'AUTH-002',
      message: 'Account locked',
      detail: 'This account is locked and must wait before another login attempt.',
    },
  ],
  [
    'rate@fix.com',
    {
      status: 429,
      code: 'RATE-001',
      message: 'Too many login attempts',
      detail: 'Too many login attempts were received from this client.',
    },
  ],
  [
    'unknown@fix.com',
    {
      status: 500,
      code: 'AUTH-999',
      message: 'Unmapped auth failure',
      detail: 'This fixture simulates an untranslated backend auth code.',
      traceId: 'corr-auth-999',
    },
  ],
]);

const createProfile = ({
  memberUuid,
  email,
  name,
  accountId,
  sessionMode = 'valid',
  orderScenario = 'success',
  aliases = [],
  mfaScenario = 'none',
  totpEnrolled = false,
}) => ({
  sessionMode,
  orderScenario,
  aliases,
  mfaScenario,
  member: {
    memberUuid,
    email,
    name,
    role: 'ROLE_USER',
    totpEnrolled,
    accountId,
  },
});

const profilesByLogin = new Map();
const profilesByEmail = new Map();
const recoveryChallenges = new Map();
const terminalForgot403Emails = new Set(['csrf-terminal@fix.com']);
const terminalChallenge403Emails = new Set(['challenge-csrf@fix.com']);
const terminalReset403Tokens = new Set(['csrf-terminal-token']);

const indexProfile = (profile) => {
  const keys = new Set([
    profile.member.email,
    ...profile.aliases,
  ]);

  for (const key of keys) {
    profilesByLogin.set(normalizeIdentifier(key), profile);
  }

  profilesByEmail.set(normalizeIdentifier(profile.member.email), profile);
};

[
  createProfile({
    memberUuid: 'member-001',
    email: 'demo@fix.com',
    name: 'Demo User',
    accountId: '1',
  }),
  createProfile({
    memberUuid: 'member-002',
    email: 'reauth@fix.com',
    name: 'Reauth Refresh',
    accountId: '2',
    sessionMode: 'reauth',
  }),
  createProfile({
    memberUuid: 'member-003',
    email: 'stale@fix.com',
    name: 'Stale Resume',
    accountId: '3',
    sessionMode: 'stale',
  }),
  createProfile({
    memberUuid: 'member-005',
    email: 'kickout@fix.com',
    name: 'Kickout User',
    accountId: '5',
    sessionMode: 'new-login-kickout',
  }),
  createProfile({
    memberUuid: 'member-006',
    email: 'taken-user@fix.com',
    name: 'Taken User',
    accountId: '6',
  }),
  createProfile({
    memberUuid: 'member-007',
    email: 'pending-order@fix.com',
    name: 'Pending Order',
    accountId: '7',
    orderScenario: 'fep-002',
    mfaScenario: 'verify',
    totpEnrolled: true,
  }),
  createProfile({
    memberUuid: 'member-008',
    email: 'unknown-order@fix.com',
    name: 'Unknown Order',
    accountId: '8',
    orderScenario: 'unknown-external',
  }),
  createProfile({
    memberUuid: 'member-009',
    email: 'no-account@fix.com',
    name: 'No Account',
  }),
  createProfile({
    memberUuid: 'member-010',
    email: 'mfa-enroll@fix.com',
    name: 'MFA Enroll Demo',
    accountId: '10',
    mfaScenario: 'enroll',
    totpEnrolled: false,
  }),
  createProfile({
    memberUuid: 'member-011',
    email: 'mfa-verify@fix.com',
    name: 'MFA Verify Demo',
    accountId: '11',
    mfaScenario: 'verify',
    totpEnrolled: true,
  }),
  createProfile({
    memberUuid: 'member-012',
    email: 'order-stepup@fix.com',
    name: 'Order Step-Up Demo',
    accountId: '12',
    orderScenario: 'step-up',
    mfaScenario: 'verify',
    totpEnrolled: true,
  }),
  createProfile({
    memberUuid: 'member-013',
    email: 'cash-order@fix.com',
    name: 'Insufficient Cash Demo',
    accountId: '13',
    orderScenario: 'insufficient-cash',
    mfaScenario: 'verify',
    totpEnrolled: true,
  }),
  createProfile({
    memberUuid: 'member-014',
    email: 'quote-story@fix.com',
    name: 'Quote Freshness Demo',
    accountId: '14',
    orderScenario: 'stale-quote',
    mfaScenario: 'verify',
    totpEnrolled: true,
  }),
].forEach(indexProfile);

const sessions = new Map();
const orderSessions = new Map();
const pendingLoginChallenges = new Map();
const pendingTotpEnrollments = new Map();

class InvalidRequestBodyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidRequestBodyError';
  }
}

const parseUrlEncodedBody = (bodyString) => {
  const params = new URLSearchParams(bodyString);
  const body = {};

  for (const [key, value] of params.entries()) {
    body[key] = value;
  }

  return body;
};

const readRequestBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const bodyString = Buffer.concat(chunks).toString('utf8');
  const contentType = String(request.headers['content-type'] ?? '').toLowerCase();

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(bodyString);
    } catch {
      throw new InvalidRequestBodyError('Expected a valid JSON request body.');
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return parseUrlEncodedBody(bodyString);
  }

  try {
    return JSON.parse(bodyString);
  } catch {
    if (bodyString.includes('=')) {
      return parseUrlEncodedBody(bodyString);
    }

    throw new InvalidRequestBodyError(
      'Mock auth server accepts JSON or application/x-www-form-urlencoded request bodies.',
    );
  }
};

const readMutationBody = async (request, response) => {
  try {
    return await readRequestBody(request);
  } catch (error) {
    if (error instanceof InvalidRequestBodyError) {
      writeJson(
        response,
        400,
        errorEnvelope(
          'VALIDATION-001',
          'Invalid request payload',
          error.message,
        ),
      );
      return null;
    }

    throw error;
  }
};

const parseCookies = (cookieHeader) => {
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(';').reduce((cookies, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');

    if (!rawKey) {
      return cookies;
    }

    cookies[rawKey] = rawValue.join('=');
    return cookies;
  }, {});
};

const successEnvelope = (data) => ({
  success: true,
  data,
  error: null,
});

const errorEnvelope = (code, message, detail, options = {}) => ({
  success: false,
  data: null,
  error: {
    code,
    message,
    detail,
    details: options.details,
    operatorCode: options.operatorCode,
    retryAfterSeconds: options.retryAfterSeconds,
    userMessageKey: options.userMessageKey,
    timestamp: new Date().toISOString(),
  },
});

const ORDER_FIXTURE_EXPECTATIONS = {
  success: {
    quantity: 1,
    price: 70_100,
    side: 'BUY',
    symbol: '005930',
  },
  'fep-002': {
    quantity: 2,
    price: 70_100,
    side: 'BUY',
    symbol: '005930',
  },
  'unknown-external': {
    quantity: 1,
    price: 70_100,
    side: 'BUY',
    symbol: '005930',
  },
  'step-up': {
    quantity: 1,
    price: 70_100,
    side: 'BUY',
    symbol: '005930',
  },
  'insufficient-cash': {
    quantity: 1,
    price: 70_100,
    side: 'BUY',
    symbol: '005930',
  },
  'stale-quote': {
    quantity: 3,
    price: null,
    side: 'BUY',
    symbol: '005930',
    orderType: 'MARKET',
  },
};

const PORTFOLIO_AS_OF = '2026-03-11T09:10:00Z';

const createPortfolioFixture = (accountId) => {
  const numericAccountId = Number.parseInt(accountId, 10);
  const memberId = Number.isSafeInteger(numericAccountId) ? numericAccountId : 1;
  const positions = [
    {
      accountId: numericAccountId,
      memberId,
      symbol: '005930',
      quantity: 120,
      availableQuantity: 20,
      availableQty: 20,
      balance: 100_000_000,
      availableBalance: 100_000_000,
      currency: 'KRW',
      asOf: PORTFOLIO_AS_OF,
      ...(accountId === '14'
        ? {
            marketPrice: 70_100,
            quoteSnapshotId: 'qsnap-live-001',
            quoteAsOf: '2026-03-12T08:45:00Z',
            quoteSourceMode: 'LIVE',
          }
        : {}),
    },
    {
      accountId: numericAccountId,
      memberId,
      symbol: '000660',
      quantity: 15,
      availableQuantity: 7,
      availableQty: 7,
      balance: 98_500_000,
      availableBalance: 98_500_000,
      currency: 'KRW',
      asOf: PORTFOLIO_AS_OF,
      ...(accountId === '14'
        ? {
            marketPrice: 194_000,
            quoteSnapshotId: 'qsnap-delayed-001',
            quoteAsOf: '2026-03-12T08:15:00Z',
            quoteSourceMode: 'DELAYED',
          }
        : {}),
    },
    ...(accountId === '14'
      ? [
          {
            accountId: numericAccountId,
            memberId,
            symbol: '035420',
            quantity: 9,
            availableQuantity: 4,
            availableQty: 4,
            balance: 97_100_000,
            availableBalance: 97_100_000,
            currency: 'KRW',
            asOf: PORTFOLIO_AS_OF,
            marketPrice: 223_000,
            quoteSnapshotId: 'qsnap-replay-001',
            quoteAsOf: '2026-03-12T07:45:00Z',
            quoteSourceMode: 'REPLAY',
          },
        ]
      : []),
  ];

  const orderHistory = [
    {
      symbol: '005930',
      symbolName: '삼성전자',
      side: 'BUY',
      qty: 3,
      unitPrice: 70_100,
      totalAmount: 210_300,
      status: 'FILLED',
      clOrdId: 'cl-portfolio-001',
      createdAt: '2026-03-11T09:00:00Z',
    },
    {
      symbol: '000660',
      symbolName: 'SK하이닉스',
      side: 'SELL',
      qty: 2,
      unitPrice: 120_000,
      totalAmount: 240_000,
      status: 'CANCELED',
      clOrdId: 'cl-portfolio-002',
      createdAt: '2026-03-11T08:50:00Z',
    },
    {
      symbol: '005930',
      symbolName: '삼성전자',
      side: 'BUY',
      qty: 1,
      unitPrice: 70_300,
      totalAmount: 70_300,
      status: 'FILLED',
      clOrdId: 'cl-portfolio-003',
      createdAt: '2026-03-11T08:40:00Z',
    },
    {
      symbol: '000660',
      symbolName: 'SK하이닉스',
      side: 'BUY',
      qty: 4,
      unitPrice: 119_500,
      totalAmount: 478_000,
      status: 'FILLED',
      clOrdId: 'cl-portfolio-004',
      createdAt: '2026-03-11T08:30:00Z',
    },
    {
      symbol: '035420',
      symbolName: 'NAVER',
      side: 'SELL',
      qty: 1,
      unitPrice: 220_000,
      totalAmount: 220_000,
      status: 'REJECTED',
      clOrdId: 'cl-portfolio-005',
      createdAt: '2026-03-11T08:20:00Z',
    },
    {
      symbol: '005930',
      symbolName: '삼성전자',
      side: 'SELL',
      qty: 2,
      unitPrice: 70_600,
      totalAmount: 141_200,
      status: 'FILLED',
      clOrdId: 'cl-portfolio-006',
      createdAt: '2026-03-11T08:10:00Z',
    },
    {
      symbol: '000660',
      symbolName: 'SK하이닉스',
      side: 'BUY',
      qty: 2,
      unitPrice: 121_000,
      totalAmount: 242_000,
      status: 'FILLED',
      clOrdId: 'cl-portfolio-007',
      createdAt: '2026-03-11T08:00:00Z',
    },
    {
      symbol: '005930',
      symbolName: '삼성전자',
      side: 'BUY',
      qty: 5,
      unitPrice: 69_900,
      totalAmount: 349_500,
      status: 'FILLED',
      clOrdId: 'cl-portfolio-008',
      createdAt: '2026-03-11T07:50:00Z',
    },
    {
      symbol: '000660',
      symbolName: 'SK하이닉스',
      side: 'SELL',
      qty: 1,
      unitPrice: 118_000,
      totalAmount: 118_000,
      status: 'FILLED',
      clOrdId: 'cl-portfolio-009',
      createdAt: '2026-03-11T07:40:00Z',
    },
    {
      symbol: '005930',
      symbolName: '삼성전자',
      side: 'BUY',
      qty: 2,
      unitPrice: 70_050,
      totalAmount: 140_100,
      status: 'FILLED',
      clOrdId: 'cl-portfolio-010',
      createdAt: '2026-03-11T07:30:00Z',
    },
    {
      symbol: '000660',
      symbolName: 'SK하이닉스',
      side: 'BUY',
      qty: 3,
      unitPrice: 119_000,
      totalAmount: 357_000,
      status: 'FILLED',
      clOrdId: 'cl-portfolio-011',
      createdAt: '2026-03-11T07:20:00Z',
    },
    {
      symbol: '005930',
      symbolName: '삼성전자',
      side: 'SELL',
      qty: 1,
      unitPrice: 70_800,
      totalAmount: 70_800,
      status: 'FILLED',
      clOrdId: 'cl-portfolio-012',
      createdAt: '2026-03-11T07:10:00Z',
    },
  ];

  return {
    summary: {
      accountId: numericAccountId,
      memberId,
      symbol: '',
      quantity: 0,
      availableQuantity: 0,
      availableQty: 0,
      balance: 100_000_000,
      availableBalance: 100_000_000,
      currency: 'KRW',
      asOf: PORTFOLIO_AS_OF,
    },
    positions,
    orderHistory,
  };
};

const getPortfolioFixture = (accountId) => {
  const existing = portfolioFixturesByAccountId.get(accountId);

  if (existing) {
    return existing;
  }

  const created = createPortfolioFixture(accountId);
  portfolioFixturesByAccountId.set(accountId, created);
  return created;
};

const readAuthenticatedProfile = (cookies, response) => {
  const sessionId = cookies.JSESSIONID;

  if (!sessionId || !sessions.has(sessionId)) {
    writeJson(
      response,
      401,
      errorEnvelope(
        'AUTH-003',
        'Authentication required',
        'A valid authenticated session cookie was not found.',
      ),
    );
    return null;
  }

  return sessions.get(sessionId);
};

const parsePositiveIntegerOrDefault = (value, fallback) => {
  const parsed = parsePositiveWholeNumber(String(value ?? ''));
  return parsed ?? fallback;
};

const parseNonNegativeIntegerOrDefault = (value, fallback) => {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isSafeInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return fallback;
};

const createHistoryPage = (items, page, size) => {
  const totalElements = items.length;
  const totalPages = totalElements === 0 ? 0 : Math.ceil(totalElements / size);
  const safePage = totalPages === 0 ? 0 : Math.min(page, totalPages - 1);
  const start = safePage * size;

  return {
    content: items.slice(start, start + size),
    totalElements,
    totalPages,
    number: safePage,
    size,
  };
};

const parsePositiveWholeNumber = (value) => {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const validateOrderRequest = ({ body, profile, request, response }) => {
  const accountId = String(body.accountId ?? '').trim();
  if (!profile.member.accountId || accountId !== profile.member.accountId) {
    writeJson(
      response,
      403,
      errorEnvelope(
        'CHANNEL-006',
        'Order ownership mismatch',
        'The submitted accountId must match the authenticated member session.',
      ),
    );
    return null;
  }

  const headerClOrdId =
    typeof request.headers['x-clordid'] === 'string'
      ? request.headers['x-clordid'].trim()
      : '';
  if (!headerClOrdId) {
    writeJson(
      response,
      422,
      errorEnvelope(
        'VALIDATION-001',
        'Invalid order idempotency contract',
        'The X-ClOrdID header must be present for canonical order sessions.',
      ),
    );
    return null;
  }

  const quantity = parsePositiveWholeNumber(String(body.qty ?? body.quantity ?? ''));
  const rawPrice = body.price;
  const price = rawPrice === null || typeof rawPrice === 'undefined'
    ? null
    : parsePositiveWholeNumber(String(rawPrice));
  const symbol = typeof body.symbol === 'string' ? body.symbol.trim() : '';
  const side = typeof body.side === 'string' ? body.side.trim() : '';
  const orderType = typeof body.orderType === 'string' ? body.orderType.trim() : 'LIMIT';
  if (
    !quantity
    || !symbol
    || !side
    || (orderType === 'LIMIT' && !price)
    || (orderType === 'MARKET' && price !== null)
  ) {
    writeJson(
      response,
      422,
      errorEnvelope(
        'VALIDATION-001',
        'Invalid order payload',
        'The mock order endpoint requires accountId, clOrdId, symbol, side, quantity, and a valid price contract for the selected order type.',
      ),
    );
    return null;
  }

  const expected = ORDER_FIXTURE_EXPECTATIONS[profile.orderScenario] ?? ORDER_FIXTURE_EXPECTATIONS.success;
  if (
    quantity !== expected.quantity
    || price !== expected.price
    || symbol !== expected.symbol
    || side !== expected.side
    || orderType !== (expected.orderType ?? 'LIMIT')
  ) {
    writeJson(
      response,
      422,
      errorEnvelope(
        'VALIDATION-001',
        'Unexpected order fixture payload',
        `The ${profile.orderScenario} persona expects ${expected.symbol} ${expected.side} ${expected.quantity} @ ${expected.price ?? 'MARKET'}.`,
      ),
    );
    return null;
  }

  return {
    accountId: Number.parseInt(accountId, 10),
    clOrdId: headerClOrdId,
    orderType,
    price,
    side,
    symbol,
    quantity,
  };
};

const applyExecutedOrderToPortfolio = (session) => {
  const fixture = getPortfolioFixture(String(session.accountId));
  const matchedPosition = fixture.positions.find((position) => position.symbol === session.symbol);

  if (!matchedPosition) {
    return;
  }

  const delta = session.side === 'SELL'
    ? -session.qty
    : session.qty;
  matchedPosition.quantity += delta;
};

const buildOrderSessionResponse = (session, overrides = {}) => ({
  orderSessionId: session.orderSessionId,
  clOrdId: session.clOrdId,
  status: session.status,
  challengeRequired: session.challengeRequired,
  authorizationReason: session.authorizationReason,
  accountId: session.accountId,
  symbol: session.symbol,
  side: session.side,
  orderType: session.orderType,
  qty: session.qty,
  price: session.price,
  executionResult: session.executionResult ?? null,
  executedQty: session.executedQty ?? null,
  leavesQty: session.leavesQty ?? null,
  executedPrice: session.executedPrice ?? null,
  externalOrderId: session.externalOrderId ?? null,
  failureReason: session.failureReason ?? null,
  executedAt: session.executedAt ?? null,
  canceledAt: session.canceledAt ?? null,
  createdAt: session.createdAt,
  updatedAt: overrides.updatedAt ?? session.updatedAt,
  expiresAt: session.expiresAt,
  remainingSeconds: Math.max(0, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000)),
  ...overrides,
});

const createOrderSession = (profile, validatedOrder) => {
  const timestamp = new Date().toISOString();
  const requiresChallenge = profile.orderScenario === 'step-up';
  const session = {
    orderSessionId: `ord-sess-${crypto.randomUUID()}`,
    clOrdId: validatedOrder.clOrdId,
    status: requiresChallenge ? 'PENDING_NEW' : 'AUTHED',
    challengeRequired: requiresChallenge,
    authorizationReason: requiresChallenge
      ? 'ELEVATED_ORDER_RISK'
      : 'RECENT_LOGIN_MFA',
    accountId: validatedOrder.accountId,
    symbol: validatedOrder.symbol,
    side: validatedOrder.side,
    orderType: validatedOrder.orderType || 'LIMIT',
    qty: validatedOrder.quantity,
    price: validatedOrder.price,
    profileEmail: profile.member.email,
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };

  orderSessions.set(session.orderSessionId, session);
  return session;
};

const orderErrorEnvelope = (code, message, detail, options = {}) => ({
  success: false,
  data: null,
  traceId: options.traceId,
  error: {
    code,
    message,
    detail,
    operatorCode: options.operatorCode,
    retryAfterSeconds: options.retryAfterSeconds,
    timestamp: new Date().toISOString(),
  },
});

const writeJson = (response, statusCode, payload, headers = {}) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(payload));
};

const writeForbidden = (response) => {
  response.writeHead(403, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end('Forbidden');
};

const ensureCsrf = (request, response, cookies) => {
  const csrfCookie = cookies['XSRF-TOKEN'];
  const csrfHeader =
    request.headers['x-xsrf-token']
    ?? request.headers['x-csrf-token'];

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    writeJson(
      response,
      403,
      errorEnvelope(
        'AUTH-403',
        'Missing or invalid CSRF token.',
        'The XSRF-TOKEN cookie must match the X-XSRF-TOKEN header.',
      ),
    );
    return false;
  }

  return true;
};

const issueSession = (profile) => {
  const sessionId = `sess-${crypto.randomUUID()}`;
  sessions.set(sessionId, profile);
  return sessionId;
};

const MFA_CODE = '123456';

const issueLoginChallenge = (profile, nextAction) => {
  const loginToken = `login-${crypto.randomUUID()}`;
  pendingLoginChallenges.set(loginToken, {
    profile,
    nextAction,
  });

  return {
    loginToken,
    nextAction,
    totpEnrolled: profile.member.totpEnrolled,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    enrollUrl: nextAction === 'ENROLL_TOTP' ? '/settings/totp/enroll' : undefined,
  };
};

const issueTotpEnrollment = (profile, loginToken) => {
  const enrollmentToken = `enrollment-${crypto.randomUUID()}`;
  const secret = 'JBSWY3DPEHPK3PXP';

  pendingTotpEnrollments.set(enrollmentToken, {
    profile,
    loginToken,
  });

  return {
    enrollmentToken,
    qrUri: `otpauth://totp/FIXYZ:${encodeURIComponent(profile.member.email)}?secret=${secret}&issuer=FIXYZ&period=30&digits=6`,
    manualEntryKey: 'JBSW Y3DP EHPK 3PXP',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
};

const createPasswordRecoveryPayload = () => ({
  accepted: true,
  message: 'If the account is eligible, a reset email will be sent.',
  recovery: {
    challengeEndpoint: '/api/v1/auth/password/forgot/challenge',
    challengeMayBeRequired: true,
  },
});

const makeCookie = (name, value) =>
  `${name}=${value}; Path=/; SameSite=Lax`;

const server = http.createServer(async (request, response) => {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);
  const cookies = parseCookies(request.headers.cookie);

  console.log(
    `[mock-auth] ${method} ${url.pathname} cookies=${Object.keys(cookies).join(',') || '-'} xsrf=${request.headers['x-xsrf-token'] ?? '-'}`,
  );

  if (url.pathname === '/__health') {
    writeJson(response, 200, { status: 'ok' });
    return;
  }

  if (url.pathname === '/actuator/health') {
    writeJson(response, 200, { status: 'UP' });
    return;
  }

  if (method === 'GET' && url.pathname === '/api/v1/auth/csrf') {
    const token = `csrf-${crypto.randomUUID()}`;
    writeJson(response, 200, successEnvelope({ csrfToken: token }), {
      'Set-Cookie': makeCookie('XSRF-TOKEN', token),
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/v1/auth/login') {
    if (!ensureCsrf(request, response, cookies)) {
      return;
    }

    const body = await readMutationBody(request, response);

    if (!body) {
      return;
    }

    const identifier =
      typeof body.email === 'string'
        ? normalizeIdentifier(body.email)
        : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const profile = profilesByLogin.get(identifier);
    const scriptedError = scriptedLoginErrors.get(identifier);

    if (scriptedError) {
      writeJson(
        response,
        scriptedError.status,
        {
          ...errorEnvelope(
            scriptedError.code,
            scriptedError.message,
            scriptedError.detail,
          ),
          traceId: scriptedError.traceId,
        },
      );
      return;
    }

    if (!profile || password !== VALID_PASSWORD) {
      writeJson(
        response,
        401,
        errorEnvelope(
          'AUTH-001',
          'Credential mismatch',
          'The supplied email or password is invalid.',
        ),
      );
      return;
    }

    if (profile.mfaScenario === 'enroll') {
      writeJson(response, 200, successEnvelope(issueLoginChallenge(profile, 'ENROLL_TOTP')));
      return;
    }

    if (profile.mfaScenario === 'verify') {
      writeJson(response, 200, successEnvelope(issueLoginChallenge(profile, 'VERIFY_TOTP')));
      return;
    }

    const sessionId = issueSession(profile);

    writeJson(response, 200, successEnvelope(profile.member), {
      'Set-Cookie': makeCookie('JSESSIONID', sessionId),
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/v1/auth/otp/verify') {
    if (!ensureCsrf(request, response, cookies)) {
      return;
    }

    const body = await readMutationBody(request, response);

    if (!body) {
      return;
    }

    const loginToken = typeof body.loginToken === 'string' ? body.loginToken.trim() : '';
    const otpCode = typeof body.otpCode === 'string' ? body.otpCode.trim() : '';
    const challenge = pendingLoginChallenges.get(loginToken);

    if (!challenge || challenge.nextAction !== 'VERIFY_TOTP') {
      writeJson(
        response,
        401,
        errorEnvelope(
          'AUTH-018',
          'Login MFA challenge expired',
          'The login MFA challenge is invalid or has already been consumed.',
        ),
      );
      return;
    }

    if (otpCode !== MFA_CODE) {
      writeJson(
        response,
        401,
        errorEnvelope(
          'AUTH-010',
          'Invalid MFA code',
          'The provided Google Authenticator code did not match the current time window.',
        ),
      );
      return;
    }

    pendingLoginChallenges.delete(loginToken);

    const sessionId = issueSession(challenge.profile);
    writeJson(response, 200, successEnvelope(challenge.profile.member), {
      'Set-Cookie': makeCookie('JSESSIONID', sessionId),
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/v1/members/me/totp/enroll') {
    if (!ensureCsrf(request, response, cookies)) {
      return;
    }

    const body = await readMutationBody(request, response);

    if (!body) {
      return;
    }

    const loginToken = typeof body.loginToken === 'string' ? body.loginToken.trim() : '';
    const challenge = pendingLoginChallenges.get(loginToken);

    if (!challenge || challenge.nextAction !== 'ENROLL_TOTP') {
      writeJson(
        response,
        401,
        errorEnvelope(
          'AUTH-018',
          'Enrollment challenge expired',
          'The TOTP enrollment bootstrap request requires a valid pending login challenge.',
        ),
      );
      return;
    }

    writeJson(response, 200, successEnvelope(issueTotpEnrollment(challenge.profile, loginToken)));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/v1/members/me/totp/confirm') {
    if (!ensureCsrf(request, response, cookies)) {
      return;
    }

    const body = await readMutationBody(request, response);

    if (!body) {
      return;
    }

    const loginToken = typeof body.loginToken === 'string' ? body.loginToken.trim() : '';
    const enrollmentToken =
      typeof body.enrollmentToken === 'string' ? body.enrollmentToken.trim() : '';
    const otpCode = typeof body.otpCode === 'string' ? body.otpCode.trim() : '';
    const challenge = pendingLoginChallenges.get(loginToken);
    const enrollment = pendingTotpEnrollments.get(enrollmentToken);

    if (
      !challenge
      || challenge.nextAction !== 'ENROLL_TOTP'
      || !enrollment
      || enrollment.loginToken !== loginToken
      || enrollment.profile !== challenge.profile
    ) {
      writeJson(
        response,
        401,
        errorEnvelope(
          'AUTH-018',
          'Enrollment confirmation expired',
          'The TOTP enrollment confirmation requires valid login and enrollment tokens.',
        ),
      );
      return;
    }

    if (otpCode !== MFA_CODE) {
      writeJson(
        response,
        401,
        errorEnvelope(
          'AUTH-010',
          'Invalid MFA code',
          'The provided Google Authenticator code did not match the current time window.',
        ),
      );
      return;
    }

    pendingLoginChallenges.delete(loginToken);
    pendingTotpEnrollments.delete(enrollmentToken);
    challenge.profile.member.totpEnrolled = true;
    challenge.profile.mfaScenario = 'verify';

    const sessionId = issueSession(challenge.profile);
    writeJson(response, 200, successEnvelope(challenge.profile.member), {
      'Set-Cookie': makeCookie('JSESSIONID', sessionId),
    });
    return;
  }

  if (method === 'POST' && url.pathname === '/api/v1/auth/register') {
    if (!ensureCsrf(request, response, cookies)) {
      return;
    }

    const body = await readMutationBody(request, response);

    if (!body) {
      return;
    }

    const email = typeof body.email === 'string' ? normalizeIdentifier(body.email) : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!email || !name || password !== VALID_PASSWORD) {
      writeJson(
        response,
        400,
        errorEnvelope(
          'VALIDATION-001',
          'Invalid register payload',
          'The mock auth server requires the canonical Story 1.4 fixture values.',
        ),
      );
      return;
    }

    const existingProfile = profilesByEmail.get(email);

    if (existingProfile) {
      writeJson(
        response,
        409,
        errorEnvelope(
          'AUTH-017',
          'Email already exists',
          'Duplicate email',
        ),
      );
      return;
    }

    const profile = createProfile({
      memberUuid: `member-${crypto.randomUUID()}`,
      email,
      name,
      mfaScenario: 'enroll',
    });

    indexProfile(profile);

    writeJson(response, 201, successEnvelope(profile.member));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/v1/auth/password/forgot/challenge') {
    if (!ensureCsrf(request, response, cookies)) {
      return;
    }

    const body = await readMutationBody(request, response);

    if (!body) {
      return;
    }

    const email =
      typeof body.email === 'string'
        ? normalizeIdentifier(body.email)
        : '';

    if (!email) {
      writeJson(
        response,
        400,
        errorEnvelope(
          'VALIDATION-001',
          'Invalid recovery payload',
          'Email is required to bootstrap a password recovery challenge.',
        ),
      );
      return;
    }

    if (terminalChallenge403Emails.has(email)) {
      writeForbidden(response);
      return;
    }

    const challengeToken = `challenge-${crypto.randomUUID()}`;
    recoveryChallenges.set(challengeToken, email);

    writeJson(response, 200, successEnvelope({
      challengeToken,
      challengeType: 'proof-of-work',
      challengeTtlSeconds: 300,
    }));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/v1/auth/password/forgot') {
    if (!ensureCsrf(request, response, cookies)) {
      return;
    }

    const body = await readMutationBody(request, response);

    if (!body) {
      return;
    }

    const email =
      typeof body.email === 'string'
        ? normalizeIdentifier(body.email)
        : '';

    if (!email) {
      writeJson(
        response,
        400,
        errorEnvelope(
          'VALIDATION-001',
          'Invalid recovery payload',
          'Email is required to request password recovery.',
        ),
      );
      return;
    }

    if (terminalForgot403Emails.has(email)) {
      writeForbidden(response);
      return;
    }

    const challengeToken =
      typeof body.challengeToken === 'string' ? body.challengeToken : '';
    const challengeAnswer =
      typeof body.challengeAnswer === 'string' ? body.challengeAnswer.trim() : '';

    if (challengeToken || challengeAnswer) {
      const expectedEmail = recoveryChallenges.get(challengeToken);

      if (
        !expectedEmail
        || expectedEmail !== email
        || (challengeAnswer !== 'verified' && challengeAnswer !== 'ready')
      ) {
        writeJson(
          response,
          401,
          errorEnvelope(
            'AUTH-012',
            'reset token invalid or expired',
            'The password recovery challenge token is invalid, expired, or already consumed.',
          ),
        );
        return;
      }

      recoveryChallenges.delete(challengeToken);
    }

    writeJson(response, 202, successEnvelope(createPasswordRecoveryPayload()));
    return;
  }

  if (method === 'POST' && url.pathname === '/api/v1/auth/password/reset') {
    if (!ensureCsrf(request, response, cookies)) {
      return;
    }

    const body = await readMutationBody(request, response);

    if (!body) {
      return;
    }

    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const newPassword =
      typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!token || !newPassword) {
      writeJson(
        response,
        400,
        errorEnvelope(
          'VALIDATION-001',
          'Invalid reset payload',
          'Reset token and new password are required.',
        ),
      );
      return;
    }

    if (terminalReset403Tokens.has(token)) {
      writeForbidden(response);
      return;
    }

    if (token === 'same-password-token') {
      writeJson(
        response,
        422,
        errorEnvelope(
          'AUTH-015',
          'new password equals current password',
          'The new password must differ from the current password.',
        ),
      );
      return;
    }

    if (token !== 'valid-reset-token') {
      writeJson(
        response,
        401,
        errorEnvelope(
          'AUTH-012',
          'reset token invalid or expired',
          'The supplied token is invalid or expired.',
        ),
      );
      return;
    }

    response.writeHead(204);
    response.end();
    return;
  }

  if (method === 'GET' && url.pathname === '/api/v1/auth/session') {
    const profile = readAuthenticatedProfile(cookies, response);

    if (!profile) {
      return;
    }

    if (profile.sessionMode === 'reauth') {
      writeJson(
        response,
        401,
        errorEnvelope(
          'AUTH-003',
          'Authentication required',
          'This mock session is configured to force deterministic re-auth.',
        ),
      );
      return;
    }

    if (profile.sessionMode === 'stale') {
      writeJson(
        response,
        410,
        errorEnvelope(
          'CHANNEL-001',
          'Redis session expired',
          'This mock session is configured to expire on resume validation.',
        ),
      );
      return;
    }

    if (profile.sessionMode === 'new-login-kickout') {
      writeJson(
        response,
        401,
        errorEnvelope(
          'AUTH-016',
          'Session invalidated by another login',
          'This mock session was invalidated by a newer login on another device.',
        ),
      );
      return;
    }

    writeJson(response, 200, successEnvelope(profile.member));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/v1/notifications') {
    const profile = readAuthenticatedProfile(cookies, response);

    if (!profile) {
      return;
    }

    const sessionId = cookies.JSESSIONID;
    if (!sessionId) {
      writeForbidden(response);
      return;
    }

    const limit = parsePositiveIntegerOrDefault(url.searchParams.get('limit'), 20);
    const cursorId = parseNonNegativeIntegerOrDefault(url.searchParams.get('cursorId'), 0);
    const items = getNotificationItemsForSession(sessionId)
      .slice()
      .sort((left, right) => right.notificationId - left.notificationId)
      .filter((item) => (cursorId > 0 ? item.notificationId < cursorId : true))
      .slice(0, limit);

    writeJson(response, 200, successEnvelope({ items }));
    return;
  }

  const notificationReadMatch = method === 'PATCH'
    ? url.pathname.match(/^\/api\/v1\/notifications\/(\d+)\/read$/)
    : null;

  if (notificationReadMatch) {
    if (!ensureCsrf(request, response, cookies)) {
      return;
    }

    const profile = readAuthenticatedProfile(cookies, response);

    if (!profile) {
      return;
    }

    const sessionId = cookies.JSESSIONID;
    if (!sessionId) {
      writeForbidden(response);
      return;
    }

    const [, rawNotificationId] = notificationReadMatch;
    const notificationId = Number.parseInt(rawNotificationId, 10);
    const items = getNotificationItemsForSession(sessionId);
    const itemIndex = items.findIndex((item) => item.notificationId === notificationId);

    if (itemIndex < 0) {
      writeJson(
        response,
        404,
        errorEnvelope(
          'CHANNEL-007',
          'Notification not found',
          'The requested notification was not found for this session.',
        ),
      );
      return;
    }

    const updated = {
      ...items[itemIndex],
      read: true,
      readAt: new Date().toISOString(),
    };

    items[itemIndex] = updated;
    writeJson(response, 200, successEnvelope(updated));
    return;
  }

  if (method === 'GET' && url.pathname === '/api/v1/notifications/stream') {
    const profile = readAuthenticatedProfile(cookies, response);

    if (!profile) {
      return;
    }

    const sessionId = cookies.JSESSIONID;
    if (!sessionId) {
      writeForbidden(response);
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });

    response.write('data: ok\\n\\n');

    const streamNotification = {
      notificationId: 202,
      channel: 'ORDER_SESSION',
      message: '실시간 주문 체결 알림이 도착했습니다.',
      delivered: true,
      read: false,
      readAt: null,
    };

    const existingItems = getNotificationItemsForSession(sessionId);
    if (!existingItems.some((item) => item.notificationId === streamNotification.notificationId)) {
      existingItems.unshift(streamNotification);
    }

    const emitTimer = setTimeout(() => {
      response.write(`event: notification\\ndata: ${JSON.stringify(streamNotification)}\\n\\n`);
    }, 1200);

    const heartbeatTimer = setInterval(() => {
      response.write('data: ok\\n\\n');
    }, 5000);

    request.on('close', () => {
      clearTimeout(emitTimer);
      clearInterval(heartbeatTimer);
      response.end();
    });
    return;
  }

  const accountMatch = url.pathname.match(/^\/api\/v1\/accounts\/([^/]+)\/(summary|positions|positions\/list|orders)$/);

  if (method === 'GET' && accountMatch) {
    const profile = readAuthenticatedProfile(cookies, response);

    if (!profile) {
      return;
    }

    const [, requestedAccountId, resource] = accountMatch;
    if (!profile.member.accountId || requestedAccountId !== profile.member.accountId) {
      writeJson(
        response,
        403,
        errorEnvelope(
          'CHANNEL-006',
          'Account ownership mismatch',
          'The requested accountId must match the authenticated member session.',
        ),
      );
      return;
    }

    const fixture = getPortfolioFixture(requestedAccountId);

    if (resource === 'summary') {
      writeJson(response, 200, successEnvelope(fixture.summary));
      return;
    }

    if (resource === 'positions') {
      const symbol = url.searchParams.get('symbol')?.trim();

      if (!symbol) {
        writeJson(
          response,
          400,
          errorEnvelope(
            'CHANNEL-004',
            'Missing symbol parameter',
            'The mock account position endpoint requires a symbol query parameter.',
          ),
        );
        return;
      }

      const matchedPosition = fixture.positions.find((position) => position.symbol === symbol);
      const positionKey = `${requestedAccountId}:${symbol}`;
      const nextQueryCount = (positionQueryCountsByKey.get(positionKey) ?? 0) + 1;
      positionQueryCountsByKey.set(positionKey, nextQueryCount);
      const shouldReplayTicker =
        requestedAccountId === '14'
        && symbol === '005930'
        && nextQueryCount > 1;
      const positionPayload = shouldReplayTicker && matchedPosition
        ? {
            ...matchedPosition,
            marketPrice: 70_300,
            quoteSnapshotId: 'qsnap-replay-ticker-001',
            quoteAsOf: '2026-03-12T09:05:00Z',
            quoteSourceMode: 'REPLAY',
          }
        : matchedPosition;

      writeJson(
        response,
        200,
        successEnvelope(
          positionPayload ?? {
            ...fixture.summary,
            symbol,
          },
        ),
      );
      return;
    }

    if (resource === 'positions/list') {
      writeJson(response, 200, successEnvelope(fixture.positions));
      return;
    }

    const page = parseNonNegativeIntegerOrDefault(url.searchParams.get('page'), 0);
    const size = parsePositiveIntegerOrDefault(url.searchParams.get('size'), 10);

    writeJson(
      response,
      200,
      successEnvelope(createHistoryPage(fixture.orderHistory, page, size)),
    );
    return;
  }

  if (method === 'POST' && url.pathname === '/api/v1/orders/sessions') {
    if (!ensureCsrf(request, response, cookies)) {
      return;
    }

    const profile = readAuthenticatedProfile(cookies, response);

    if (!profile) {
      return;
    }

    const body = await readMutationBody(request, response);

    if (!body) {
      return;
    }

    const validatedOrder = validateOrderRequest({
      body,
      profile,
      request,
      response,
    });

    if (!validatedOrder) {
      return;
    }

    if (profile.orderScenario === 'insufficient-cash') {
      writeJson(
        response,
        422,
        errorEnvelope(
          'ORD-006',
          '주문 가능 금액이 부족합니다.',
          'The mock order endpoint rejected the request because the account cash is insufficient.',
          {
            operatorCode: 'INSUFFICIENT_CASH',
            userMessageKey: 'error.order.insufficient_cash',
          },
        ),
      );
      return;
    }

    if (profile.orderScenario === 'stale-quote') {
      writeJson(
        response,
        400,
        errorEnvelope(
          'VALIDATION-003',
          '시장가 주문에 사용할 시세가 오래되었습니다.',
          '시장가 주문에 사용한 quote snapshot이 허용 범위를 초과했습니다.',
          {
            operatorCode: 'STALE_QUOTE',
            userMessageKey: 'error.quote.stale',
            details: {
              symbol: '005930',
              quoteSnapshotId: 'qsnap-replay-001',
              quoteSourceMode: 'REPLAY',
              snapshotAgeMs: 65_000,
            },
          },
        ),
      );
      return;
    }

    const orderSession = createOrderSession(profile, validatedOrder);

    writeJson(
      response,
      201,
      successEnvelope(buildOrderSessionResponse(orderSession)),
    );
    return;
  }

  const orderSessionStatusMatch = method === 'GET'
    ? url.pathname.match(/^\/api\/v1\/orders\/sessions\/([^/]+)$/)
    : null;

  if (orderSessionStatusMatch) {
    const profile = readAuthenticatedProfile(cookies, response);

    if (!profile) {
      return;
    }

    const [, orderSessionId] = orderSessionStatusMatch;
    const orderSession = orderSessions.get(orderSessionId);

    if (!orderSession || orderSession.profileEmail !== profile.member.email) {
      writeJson(
        response,
        404,
        errorEnvelope(
          'ORD-008',
          'Order session not found',
          'The requested order session does not exist or is not visible to this member.',
        ),
      );
      return;
    }

    writeJson(
      response,
      200,
      successEnvelope(buildOrderSessionResponse(orderSession)),
    );
    return;
  }

  const orderSessionOtpMatch = method === 'POST'
    ? url.pathname.match(/^\/api\/v1\/orders\/sessions\/([^/]+)\/otp\/verify$/)
    : null;

  if (orderSessionOtpMatch) {
    if (!ensureCsrf(request, response, cookies)) {
      return;
    }

    const profile = readAuthenticatedProfile(cookies, response);

    if (!profile) {
      return;
    }

    const [, orderSessionId] = orderSessionOtpMatch;
    const orderSession = orderSessions.get(orderSessionId);

    if (!orderSession || orderSession.profileEmail !== profile.member.email) {
      writeJson(
        response,
        404,
        errorEnvelope(
          'ORD-008',
          'Order session not found',
          'The requested order session does not exist or is not visible to this member.',
        ),
      );
      return;
    }

    const body = await readMutationBody(request, response);

    if (!body) {
      return;
    }

    const otpCode = typeof body.otpCode === 'string' ? body.otpCode.trim() : '';
    if (otpCode !== MFA_CODE) {
      writeJson(
        response,
        422,
        errorEnvelope(
          'CHANNEL-002',
          'OTP mismatch',
          'The provided OTP code did not match the active authenticator.',
        ),
      );
      return;
    }

    orderSession.status = 'AUTHED';
    orderSession.challengeRequired = false;
    orderSession.updatedAt = new Date().toISOString();

    writeJson(
      response,
      200,
      successEnvelope(buildOrderSessionResponse(orderSession)),
    );
    return;
  }

  const orderSessionExecuteMatch = method === 'POST'
    ? url.pathname.match(/^\/api\/v1\/orders\/sessions\/([^/]+)\/execute$/)
    : null;

  if (orderSessionExecuteMatch) {
    if (!ensureCsrf(request, response, cookies)) {
      return;
    }

    const profile = readAuthenticatedProfile(cookies, response);

    if (!profile) {
      return;
    }

    const [, orderSessionId] = orderSessionExecuteMatch;
    const orderSession = orderSessions.get(orderSessionId);

    if (!orderSession || orderSession.profileEmail !== profile.member.email) {
      writeJson(
        response,
        404,
        errorEnvelope(
          'ORD-008',
          'Order session not found',
          'The requested order session does not exist or is not visible to this member.',
        ),
      );
      return;
    }

    if (orderSession.status !== 'AUTHED') {
      writeJson(
        response,
        409,
        errorEnvelope(
          'ORD-009',
          'Order session requires OTP verification',
          'The order session must be AUTHED before execute can run.',
        ),
      );
      return;
    }

    if (profile.orderScenario === 'fep-002') {
      writeJson(
        response,
        504,
        orderErrorEnvelope(
          'FEP-002',
          '주문이 아직 확정되지 않았습니다. 체결 완료로 간주하지 말고 알림이나 주문 상태를 확인해 주세요.',
          'External order status is pending.',
          {
            operatorCode: 'TIMEOUT',
            traceId: 'trace-fep-002',
          },
        ),
      );
      return;
    }

    if (profile.orderScenario === 'unknown-external') {
      writeJson(
        response,
        503,
        orderErrorEnvelope(
          'FEP-999',
          'Unknown external state',
          'External broker state is unavailable.',
          {
            operatorCode: 'UNKNOWN_EXTERNAL_STATE',
            traceId: 'trace-unknown-001',
          },
        ),
      );
      return;
    }

    orderSession.status = 'COMPLETED';
    orderSession.executionResult = 'FILLED';
    orderSession.executedQty = orderSession.qty;
    orderSession.leavesQty = 0;
    orderSession.executedPrice = orderSession.price;
    orderSession.externalOrderId = `ord-${nextOrderId++}`;
    orderSession.executedAt = new Date().toISOString();
    orderSession.updatedAt = orderSession.executedAt;
    applyExecutedOrderToPortfolio(orderSession);

    writeJson(
      response,
      200,
      successEnvelope(buildOrderSessionResponse(orderSession)),
    );
    return;
  }

  writeJson(
    response,
    404,
    errorEnvelope(
      'SYS-404',
      `No mock route for ${method} ${url.pathname}`,
      'Add the endpoint to scripts/mock-auth-server.mjs if the mobile flow starts using it.',
    ),
  );
});

server.listen(port, () => {
  console.log(`Mock auth server listening on http://localhost:${port}`);
});
