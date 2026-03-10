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
  sessionMode = 'valid',
  aliases = [],
}) => ({
  sessionMode,
  aliases,
  member: {
    memberUuid,
    email,
    name,
    role: 'ROLE_USER',
    totpEnrolled: false,
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
  }),
  createProfile({
    memberUuid: 'member-002',
    email: 'reauth@fix.com',
    name: 'Reauth Refresh',
    sessionMode: 'reauth',
  }),
  createProfile({
    memberUuid: 'member-003',
    email: 'stale@fix.com',
    name: 'Stale Resume',
    sessionMode: 'stale',
  }),
  createProfile({
    memberUuid: 'member-005',
    email: 'kickout@fix.com',
    name: 'Kickout User',
    sessionMode: 'new-login-kickout',
  }),
  createProfile({
    memberUuid: 'member-006',
    email: 'taken-user@fix.com',
    name: 'Taken User',
  }),
].forEach(indexProfile);

const sessions = new Map();

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

const errorEnvelope = (code, message, detail) => ({
  success: false,
  data: null,
  error: {
    code,
    message,
    detail,
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
  const csrfHeader = request.headers['x-xsrf-token'];

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

    const sessionId = issueSession(profile);

    writeJson(response, 200, successEnvelope(profile.member), {
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
      return;
    }

    const profile = sessions.get(sessionId);

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
