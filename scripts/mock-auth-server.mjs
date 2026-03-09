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

const loginProfiles = new Map([
  [
    'demo',
    {
      sessionMode: 'valid',
      member: {
        memberUuid: 'member-001',
        username: 'demo',
        email: 'demo@fix.com',
        name: 'Demo User',
        role: 'ROLE_USER',
        totpEnrolled: false,
      },
    },
  ],
  [
    'reauth_refresh',
    {
      sessionMode: 'reauth',
      member: {
        memberUuid: 'member-002',
        username: 'reauth_refresh',
        email: 'reauth@fix.com',
        name: 'Reauth Refresh',
        role: 'ROLE_USER',
        totpEnrolled: false,
      },
    },
  ],
  [
    'stale_resume',
    {
      sessionMode: 'stale',
      member: {
        memberUuid: 'member-003',
        username: 'stale_resume',
        email: 'stale@fix.com',
        name: 'Stale Resume',
        role: 'ROLE_USER',
        totpEnrolled: false,
      },
    },
  ],
  [
    'new_login_kickout',
    {
      sessionMode: 'new-login-kickout',
      member: {
        memberUuid: 'member-005',
        username: 'new_login_kickout',
        email: 'kickout@fix.com',
        name: 'Kickout User',
        role: 'ROLE_USER',
        totpEnrolled: false,
      },
    },
  ],
  [
    'new_user_success',
    {
      sessionMode: 'valid',
      member: {
        memberUuid: 'member-004',
        username: 'new_user_success',
        email: 'new-success@fix.com',
        name: 'New User',
        role: 'ROLE_USER',
        totpEnrolled: false,
      },
    },
  ],
]);

const sessions = new Map();

const readJsonBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
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

    const body = await readJsonBody(request);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const profile = loginProfiles.get(username);

    if (!profile || password !== VALID_PASSWORD) {
      writeJson(
        response,
        401,
        errorEnvelope(
          'AUTH-001',
          'Credential mismatch',
          'The supplied username or password is invalid.',
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

    const body = await readJsonBody(request);
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (username === 'taken_user') {
      writeJson(
        response,
        409,
        errorEnvelope(
          'AUTH-008',
          'Username already exists',
          'The chosen username is already in use.',
        ),
      );
      return;
    }

    if (!username || !email || !name || password !== VALID_PASSWORD) {
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

    const profile =
      loginProfiles.get(username) ??
      {
        sessionMode: 'valid',
        member: {
          memberUuid: `member-${crypto.randomUUID()}`,
          username,
          email,
          name,
          role: 'ROLE_USER',
          totpEnrolled: false,
        },
      };

    loginProfiles.set(username, profile);

    writeJson(response, 200, successEnvelope(profile.member));
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
