'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const preparationKeys = [
  'attempt_id',
  'installation_id',
  'os',
  'application_id',
  'push_environment',
  'code_challenge',
  'code_challenge_method',
];
function error(code, status = 400) {
  return Object.assign(new Error(code), { code, status });
}
function exactKeys(body, keys) {
  if (
    !body ||
    Array.isArray(body) ||
    typeof body !== 'object' ||
    Object.keys(body).some(key => !keys.includes(key))
  )
    throw error('INVALID_INPUT');
}
function secretEqual(left, right) {
  return timingSafeEqual(Buffer.from(hash(left)), Buffer.from(hash(right)));
}
async function readBody(request) {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16384) throw error('BODY_TOO_LARGE', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw error('INVALID_INPUT');
  }
}
function respond(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}
async function createSimulator(config) {
  if (config.fixtureEnabled !== true) throw error('FIXTURE_DISABLED');
  if (
    !config.fixtureUsername ||
    typeof config.fixturePassword !== 'string' ||
    config.fixturePassword.length < 16
  )
    throw error('FIXTURE_CREDENTIALS_REQUIRED');
  if (
    !/^[1-9][0-9]{0,9}$/.test(config.userId) ||
    Number(config.userId) > 4294967295
  )
    throw error('INVALID_SERVER_USER_ID');
  if (
    !config.accountId ||
    !config.appId ||
    !/^cvsk_[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(config.integrationToken)
  )
    throw error('SERVER_CONFIGURATION_REQUIRED');
  const origin = new URL(config.gatewayUrl);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(
    origin.hostname,
  );
  if (
    (origin.protocol !== 'https:' &&
      !(
        config.allowInsecureLoopback === true &&
        loopback &&
        origin.protocol === 'http:'
      )) ||
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    origin.pathname !== '/'
  )
    throw error('HTTPS_GATEWAY_REQUIRED');
  const base = `${origin.origin}/${encodeURIComponent(
    config.accountId,
  )}/api/v1/voice`;
  const stateFile = path.resolve(config.stateFile);
  fs.mkdirSync(path.dirname(stateFile), { recursive: true, mode: 0o700 });
  const lockFile = stateFile + '.lock';
  try {
    const lock = fs.openSync(lockFile, 'wx', 0o600);
    fs.writeFileSync(lock, String(process.pid));
    fs.closeSync(lock);
  } catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const owner = Number(fs.readFileSync(lockFile, 'utf8'));
    try {
      if (!Number.isInteger(owner) || owner < 1) throw error('STATE_LOCKED');
      process.kill(owner, 0);
      throw error('STATE_LOCKED');
    } catch (e) {
      if (e.code !== 'ESRCH') throw e;
    }
    fs.unlinkSync(lockFile);
    const lock = fs.openSync(lockFile, 'wx', 0o600);
    fs.writeFileSync(lock, String(process.pid));
    fs.closeSync(lock);
  }
  const scope = {
    gatewayOrigin: origin.origin,
    accountId: config.accountId,
    appId: config.appId,
    fixtureUsername: config.fixtureUsername,
    userId: config.userId,
  };
  let state;
  try {
    state = fs.existsSync(stateFile)
      ? JSON.parse(fs.readFileSync(stateFile, 'utf8'))
      : { scope, sessions: {}, outbox: [] };
    if (JSON.stringify(state.scope) !== JSON.stringify(scope)) {
      throw error('STATE_SCOPE_MISMATCH');
    }
    if (!state.sessions || !Array.isArray(state.outbox))
      throw error('INVALID_STATE');
  } catch (e) {
    fs.unlinkSync(lockFile);
    throw e;
  }
  function commit(change) {
    const next = structuredClone(state);
    change(next);
    const temporary = stateFile + '.tmp';
    const file = fs.openSync(temporary, 'w', 0o600);
    try {
      fs.writeFileSync(file, JSON.stringify(next));
      fs.fsyncSync(file);
    } finally {
      fs.closeSync(file);
    }
    fs.renameSync(temporary, stateFile);
    state = next;
    const directory = fs.openSync(path.dirname(stateFile), 'r');
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  }
  async function gateway(route, method, body, requestId) {
    const response = await fetch(base + route, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: {
        Authorization: `Bearer ${config.integrationToken}`,
        'Content-Type': 'application/json',
        ...(requestId ? { 'X-Request-Id': requestId } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw error('GATEWAY_UNAVAILABLE', 502);
    const text = await response.text();
    if (text.length > 16384) throw error('GATEWAY_UNAVAILABLE', 502);
    const envelope = JSON.parse(text);
    if (!envelope.data) throw error('GATEWAY_UNAVAILABLE', 502);
    return envelope.data;
  }
  function sessionFor(request, allowLoggedOut = false) {
    const authorization = request.headers.authorization;
    if (
      typeof authorization !== 'string' ||
      !/^Bearer [A-Za-z0-9_-]{43}$/.test(authorization)
    )
      throw error('UNAUTHORIZED', 401);
    const key = hash(authorization.slice(7));
    const session = state.sessions[key];
    if (
      !session ||
      (!allowLoggedOut &&
        (!session.active || Date.parse(session.expiresAt) <= Date.now()))
    )
      throw error('UNAUTHORIZED', 401);
    return { key, session };
  }
  const failures = new Map();
  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'POST' && request.url === '/api/auth/login') {
        const body = await readBody(request);
        exactKeys(body, ['username', 'password']);
        const address = request.socket.remoteAddress;
        const previous = failures.get(address);
        const attempts =
          previous && previous.until > Date.now()
            ? previous
            : { count: 0, until: Date.now() + 60000 };
        if (attempts.count >= 5) throw error('RATE_LIMITED', 429);
        if (
          typeof body.username !== 'string' ||
          typeof body.password !== 'string' ||
          !secretEqual(body.username, config.fixtureUsername) ||
          !secretEqual(body.password, config.fixturePassword)
        ) {
          attempts.count++;
          failures.set(address, attempts);
          throw error('UNAUTHORIZED', 401);
        }
        failures.delete(address);
        const token = randomBytes(32).toString('base64url');
        const expiresAt = new Date(Date.now() + 86400000).toISOString();
        commit(next => {
          next.sessions[hash(token)] = {
            principal: config.fixtureUsername,
            hostSessionRef: randomUUID(),
            expiresAt,
            active: true,
          };
        });
        respond(response, 200, {
          enterprise_access_token: token,
          enterprise_access_expires_at: expiresAt,
          enterprise_session_expires_at: expiresAt,
        });
        return;
      }
      if (request.method === 'POST' && request.url === '/api/voice/bootstrap') {
        const { key, session } = sessionFor(request);
        const body = await readBody(request);
        exactKeys(body, preparationKeys);
        if (
          !uuid.test(body.attempt_id) ||
          !uuid.test(body.installation_id) ||
          !['android', 'ios'].includes(body.os) ||
          typeof body.application_id !== 'string' ||
          !body.application_id ||
          body.application_id.length > 255 ||
          !['default', 'production', 'sandbox'].includes(
            body.push_environment,
          ) ||
          !/^[-_A-Za-z0-9]{43}$/.test(body.code_challenge) ||
          body.code_challenge_method !== 'S256'
        )
          throw error('INVALID_INPUT');
        const data = await gateway('/session-tickets', 'POST', {
          ...body,
          app_id: config.appId,
          user_id: config.userId,
          host_session_ref: session.hostSessionRef,
          host_session_expires_at: session.expiresAt,
        });
        if (
          !state.sessions[key]?.active ||
          Date.parse(session.expiresAt) <= Date.now()
        )
          throw error('UNAUTHORIZED', 401);
        if (
          typeof data.login_ticket !== 'string' ||
          data.attempt_id !== body.attempt_id ||
          typeof data.expires_at !== 'string'
        )
          throw error('GATEWAY_UNAVAILABLE', 502);
        respond(response, 200, {
          login_ticket: data.login_ticket,
          attempt_id: data.attempt_id,
          expires_at: data.expires_at,
        });
        return;
      }
      if (request.method === 'POST' && request.url === '/api/auth/logout') {
        const { key, session } = sessionFor(request, true);
        exactKeys(await readBody(request), []);
        commit(next => {
          next.sessions[key].active = false;
          if (
            !next.outbox.some(
              job => job.hostSessionRef === session.hostSessionRef,
            )
          )
            next.outbox.push({
              requestId: randomUUID(),
              hostSessionRef: session.hostSessionRef,
              status: 'pending',
              attempts: 0,
              revocationId: null,
              updatedAt: new Date().toISOString(),
            });
        });
        respond(response, 202, { status: 'pending' });
        return;
      }
      if (
        request.method === 'GET' &&
        request.url === '/api/auth/logout-status'
      ) {
        const { session } = sessionFor(request, true);
        const job = state.outbox.find(
          item => item.hostSessionRef === session.hostSessionRef,
        );
        respond(
          response,
          200,
          job
            ? {
                status: job.status,
                attempts: job.attempts,
                updated_at: job.updatedAt,
              }
            : { status: 'active' },
        );
        return;
      }
      throw error('NOT_FOUND', 404);
    } catch (e) {
      respond(response, e.status || 500, {
        error: {
          code:
            e.code && /^[A-Z_]+$/.test(e.code)
              ? e.code
              : 'HOST_OPERATION_FAILED',
        },
      });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  let processing;
  let closed = false;
  async function drain() {
    for (const item of [...state.outbox]) {
      if (item.status === 'completed') continue;
      try {
        const data = item.revocationId
          ? await gateway(
              `/service/session-revocations/${encodeURIComponent(
                item.revocationId,
              )}`,
              'GET',
            )
          : await gateway(
              '/service/session-revocations',
              'POST',
              {
                scope: 'HOST',
                host_session_ref: item.hostSessionRef,
              },
              item.requestId,
            );
        if (
          !uuid.test(data.revocation_id) ||
          !['pending', 'done'].includes(data.cleanup_status)
        )
          throw error('INVALID_GATEWAY_RESPONSE');
        commit(next => {
          const job = next.outbox.find(
            entry => entry.requestId === item.requestId,
          );
          job.revocationId = data.revocation_id;
          job.status = data.cleanup_status === 'done' ? 'completed' : 'pending';
          job.attempts++;
          job.updatedAt = new Date().toISOString();
        });
      } catch {
        commit(next => {
          const job = next.outbox.find(
            entry => entry.requestId === item.requestId,
          );
          job.attempts++;
          job.updatedAt = new Date().toISOString();
        });
      }
    }
  }
  function processOutbox() {
    if (closed) return Promise.resolve();
    if (!processing)
      processing = drain().finally(() => {
        processing = undefined;
      });
    return processing;
  }
  async function close() {
    if (closed) return;
    closed = true;
    await processing;
    if (server.listening) await new Promise(resolve => server.close(resolve));
    fs.unlinkSync(lockFile);
  }
  return { server, processOutbox, close };
}
module.exports = { createSimulator };
if (require.main === module) {
  const config = {
    fixtureEnabled: process.env.VOICE_DEMO_FIXTURE_ENABLED === '1',
    fixtureUsername:
      process.env.VOICE_DEMO_FIXTURE_USERNAME || 'fixture-customer',
    fixturePassword: process.env.VOICE_DEMO_FIXTURE_PASSWORD,
    userId: process.env.VOICE_DEMO_USER_ID,
    gatewayUrl: process.env.VOICE_GATEWAY_URL,
    allowInsecureLoopback: process.env.VOICE_ALLOW_LOOPBACK_HTTP === '1',
    accountId: process.env.VOICE_ACCOUNT_ID,
    appId: process.env.VOICE_APP_ID,
    integrationToken: process.env.VOICE_INTEGRATION_TOKEN,
    stateFile:
      process.env.VOICE_HOST_STATE_FILE ||
      path.join(__dirname, '.private/state.json'),
  };
  createSimulator(config)
    .then(app => {
      const timer = setInterval(
        () =>
          void app
            .processOutbox()
            .catch(() => console.error('HOST_OUTBOX_PERSIST_FAILED')),
        5000,
      );
      app.server.listen(Number(process.env.PORT || 8787), '127.0.0.1', () =>
        console.log('Fixture host listening on loopback'),
      );
      const shutdown = async () => {
        clearInterval(timer);
        await app.close();
        process.exit(0);
      };
      process.on('SIGTERM', shutdown);
      process.on('SIGINT', shutdown);
    })
    .catch(() => {
      console.error('HOST_START_FAILED_CHECK_SERVER_CONFIGURATION');
      process.exitCode = 1;
    });
}
