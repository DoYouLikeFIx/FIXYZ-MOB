import http from 'node:http';

const targetBaseUrl = process.env.TARGET_API_BASE ?? 'http://127.0.0.1:18082';
const listenPort = Number.parseInt(process.env.PROXY_PORT ?? '18080', 10);

const hopByHopHeaders = new Set([
  'connection',
  'content-length',
  'content-encoding',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const cookieJar = new Map();

const mergeSetCookie = (headers) => {
  const setCookies = typeof headers.getSetCookie === 'function'
    ? headers.getSetCookie()
    : headers.get('set-cookie')
      ? [headers.get('set-cookie')]
      : [];

  for (const rawCookie of setCookies) {
    if (!rawCookie) {
      continue;
    }

    const firstPair = rawCookie.split(';', 1)[0];
    const separatorIndex = firstPair.indexOf('=');

    if (separatorIndex <= 0) {
      continue;
    }

    const name = firstPair.slice(0, separatorIndex).trim();
    const value = firstPair.slice(separatorIndex + 1).trim();

    if (!name) {
      continue;
    }

    cookieJar.set(name, value);
  }
};

const buildCookieHeader = () =>
  Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');

const readRequestBody = async (request) => {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return undefined;
  }

  return Buffer.concat(chunks);
};

const server = http.createServer(async (request, response) => {
  try {
    if (!request.url || !request.method) {
      response.statusCode = 400;
      response.end('missing request metadata');
      return;
    }

    const upstreamUrl = new URL(request.url, targetBaseUrl);
    const upstreamHeaders = new Headers();

    for (const [headerName, headerValue] of Object.entries(request.headers)) {
      if (hopByHopHeaders.has(headerName.toLowerCase()) || headerValue == null) {
        continue;
      }

      if (Array.isArray(headerValue)) {
        upstreamHeaders.set(headerName, headerValue.join(', '));
      } else {
        upstreamHeaders.set(headerName, headerValue);
      }
    }

    const persistedCookieHeader = buildCookieHeader();
    if (persistedCookieHeader) {
      upstreamHeaders.set('cookie', persistedCookieHeader);
    }

    const requestBody = await readRequestBody(request);
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: requestBody,
      redirect: 'manual',
    });

    mergeSetCookie(upstreamResponse.headers);

    response.statusCode = upstreamResponse.status;

    upstreamResponse.headers.forEach((value, headerName) => {
      if (hopByHopHeaders.has(headerName.toLowerCase()) || headerName.toLowerCase() === 'set-cookie') {
        return;
      }

      response.setHeader(headerName, value);
    });

    const payload = Buffer.from(await upstreamResponse.arrayBuffer());
    response.end(payload);
  } catch (error) {
    response.statusCode = 502;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.end(JSON.stringify({
      code: 'PROXY-001',
      message: error instanceof Error ? error.message : 'proxy failure',
    }));
  }
});

server.listen(listenPort, '127.0.0.1', () => {
  console.log(`password-recovery-live-be-proxy listening on http://127.0.0.1:${listenPort} -> ${targetBaseUrl}`);
});
