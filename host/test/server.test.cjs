const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createSimulator } = require('../server.cjs');
const preparation = {
  attempt_id: '11111111-1111-4111-8111-111111111111',
  installation_id: '22222222-2222-4222-8222-222222222222',
  os: 'android',
  application_id: 'com.customervoicedemo',
  push_environment: 'default',
  code_challenge: 'a'.repeat(43),
  code_challenge_method: 'S256',
};
async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-host-test-'));
  const requests = [];
  let unavailable = false;
  let pollStatus = 'done';
  const gateway = http.createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    requests.push({
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: text ? JSON.parse(text) : null,
    });
    res.setHeader('Content-Type', 'application/json');
    if (unavailable) {
      res.writeHead(503);
      res.end('{}');
      return;
    }
    if (req.url.endsWith('/session-tickets')) {
      res.writeHead(201);
      res.end(
        JSON.stringify({
          data: {
            login_ticket: 'cvt_fixture',
            attempt_id: preparation.attempt_id,
            expires_at: '2099-01-01T00:00:00Z',
          },
        }),
      );
      return;
    }
    res.writeHead(req.method === 'POST' ? 202 : 200);
    res.end(
      JSON.stringify({
        data: {
          revocation_id: '33333333-3333-4333-8333-333333333333',
          authority_revoked_at: '2026-11-21T00:00:00Z',
          cleanup_status: req.method === 'POST' ? 'pending' : pollStatus,
        },
      }),
    );
  });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  const config = {
    webAllowedOrigins: ['http://127.0.0.1:5188'],
    fixtureEnabled: true,
    fixtureUsername: 'fixture-customer',
    fixturePassword: 'fixture-password-for-testing',
    userId: '124921946',
    gatewayUrl: `http://127.0.0.1:${gateway.address().port}`,
    allowInsecureLoopback: true,
    accountId: '1001',
    appId: 'retail-customer',
    integrationToken:
      'cvsk_44444444-4444-4444-8444-444444444444.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    stateFile: path.join(directory, 'state.json'),
  };
  let app;
  async function start() {
    app = await createSimulator(config);
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    return app;
  }
  await start();
  const request = async (route, body, token, headers = {}) => {
    const response = await fetch(
      `http://127.0.0.1:${app.server.address().port}${route}`,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    return {
      status: response.status,
      headers: response.headers,
      cache: response.headers.get('cache-control'),
      body: await response.json(),
    };
  };
  t.after(async () => {
    await app.close();
    await new Promise(resolve => gateway.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return {
    config,
    requests,
    request,
    start,
    get app() {
      return app;
    },
    set unavailable(value) {
      unavailable = value;
    },
    set pollStatus(value) {
      pollStatus = value;
    },
    directory,
  };
}
async function login(f) {
  const response = await f.request('/api/auth/login', {
    username: 'fixture-customer',
    password: 'fixture-password-for-testing',
  });
  assert.equal(response.status, 200);
  return response.body.enterprise_access_token;
}
test('fixture requires explicit enablement and rejects wrong password', async t => {
  const f = await fixture(t);
  assert.equal(
    (
      await f.request('/api/auth/login', {
        username: 'fixture-customer',
        password: 'wrong',
      })
    ).status,
    401,
  );
  await assert.rejects(
    createSimulator({ ...f.config, fixtureEnabled: false }),
    /FIXTURE_DISABLED/,
  );
});
test('bootstrap binds server principal and forwards only public PKCE fields', async t => {
  const f = await fixture(t);
  const token = await login(f);
  assert.equal(
    (await f.request('/api/voice/bootstrap', preparation)).status,
    401,
  );
  assert.equal(
    (
      await f.request(
        '/api/voice/bootstrap',
        { ...preparation, user_id: '999' },
        token,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request(
        '/api/voice/bootstrap',
        { ...preparation, code_verifier: 'private' },
        token,
      )
    ).status,
    400,
  );
  const result = await f.request('/api/voice/bootstrap', preparation, token);
  assert.equal(result.status, 200);
  assert.equal(result.cache, 'no-store');
  assert.deepEqual(result.body, {
    login_ticket: 'cvt_fixture',
    attempt_id: preparation.attempt_id,
    expires_at: '2099-01-01T00:00:00Z',
  });
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].body.user_id, '124921946');
  assert.equal(f.requests[0].body.code_challenge_method, 'S256');
  assert.match(f.requests[0].body.host_session_ref, /^[0-9a-f-]{36}$/);
  assert.equal(
    f.requests[0].headers.authorization,
    'Bearer cvsk_44444444-4444-4444-8444-444444444444.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  );
  assert.ok(!JSON.stringify(result.body).includes('cvsk_'));
});
test('logout is durable before gateway delivery and retries same id after restart', async t => {
  const f = await fixture(t);
  const token = await login(f);
  await f.request('/api/voice/bootstrap', preparation, token);
  const oldReference = f.requests[0].body.host_session_ref;
  f.unavailable = true;
  const loggedOut = await f.request('/api/auth/logout', {}, token);
  assert.equal(loggedOut.status, 202);
  assert.equal(
    (await f.request('/api/voice/bootstrap', preparation, token)).status,
    401,
  );
  await f.app.processOutbox();
  const first = f.requests.find(r =>
    r.url.endsWith('/service/session-revocations'),
  );
  assert.equal(first.body.host_session_ref, oldReference);
  const state = JSON.parse(fs.readFileSync(f.config.stateFile, 'utf8'));
  assert.equal(state.outbox.length, 1);
  assert.equal(state.outbox[0].status, 'pending');
  assert.ok(!fs.readFileSync(f.config.stateFile, 'utf8').includes(token));
  await f.app.close();
  await f.start();
  f.unavailable = false;
  await f.app.processOutbox();
  await f.app.processOutbox();
  const attempts = f.requests.filter(r =>
    r.url.endsWith('/service/session-revocations'),
  );
  assert.equal(
    attempts[0].headers['x-request-id'],
    attempts[1].headers['x-request-id'],
  );
  assert.equal(
    (await f.request('/api/auth/logout-status', undefined, token)).body.status,
    'completed',
  );
  assert.equal(fs.statSync(f.config.stateFile).mode & 0o777, 0o600);
  const nextToken = await login(f);
  await f.request('/api/voice/bootstrap', preparation, nextToken);
  assert.notEqual(f.requests.at(-1).body.host_session_ref, oldReference);
});
test('pending cleanup remains observable until gateway reports completed', async t => {
  const f = await fixture(t);
  const token = await login(f);
  await f.request('/api/auth/logout', {}, token);
  f.pollStatus = 'pending';
  await f.app.processOutbox();
  await f.app.processOutbox();
  assert.equal(
    (await f.request('/api/auth/logout-status', undefined, token)).body.status,
    'pending',
  );
  f.pollStatus = 'done';
  await f.app.processOutbox();
  assert.equal(
    (await f.request('/api/auth/logout-status', undefined, token)).body.status,
    'completed',
  );
});

test('configuration generator rejects server secrets before writing bundles', () => {
  const { spawnSync } = require('node:child_process');
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'voice-config-test-'),
  );
  try {
    const source = path.join(directory, 'voice.local.json');
    for (const secret of [
      { integrationToken: 'cvsk_private-server-key' },
      { userId: '124921946' },
      { supportName: 'cvsk_private-server-key' },
      { firebase: { private_key: 'server-private-key' } },
    ]) {
      fs.writeFileSync(
        source,
        JSON.stringify({
          backendUrl: 'https://voice.example.com',
          enterpriseBackendUrl: 'https://enterprise.example.com',
          ...secret,
        }),
      );
      const result = spawnSync(
        process.execPath,
        [path.resolve(__dirname, '../../scripts/configure.cjs')],
        { env: { ...process.env, VOICE_CONFIG_FILE: source } },
      );
      assert.notEqual(result.status, 0);
      assert.ok(!result.stdout.includes('cvsk_private-server-key'));
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('persisted host sessions cannot be reused with another tenant mapping', async t => {
  const f = await fixture(t);
  await login(f);
  await f.app.close();
  await assert.rejects(
    createSimulator({ ...f.config, appId: 'another-app' }),
    /STATE_SCOPE_MISMATCH/,
  );
});

test('logout stays inactive when directory sync fails after state replacement', async t => {
  const f = await fixture(t);
  const token = await login(f);
  const originalSync = fs.fsyncSync;
  fs.fsyncSync = descriptor => {
    if (fs.fstatSync(descriptor).isDirectory())
      throw new Error('disk-sync-failed');
    return originalSync(descriptor);
  };
  try {
    assert.equal((await f.request('/api/auth/logout', {}, token)).status, 500);
  } finally {
    fs.fsyncSync = originalSync;
  }
  assert.equal(
    (await f.request('/api/voice/bootstrap', preparation, token)).status,
    401,
  );
});

test('Web bootstrap allows exact browser origin and keeps integration secret server-side', async t => {
  const f = await fixture(t);
  const origin = 'http://127.0.0.1:5188';
  const signedIn = await f.request('/api/auth/login', {username: f.config.fixtureUsername, password: f.config.fixturePassword}, undefined, {Origin: origin});
  assert.equal(signedIn.headers.get('access-control-allow-origin'), origin);
  const response = await f.request('/api/voice/bootstrap', {...preparation, os: 'web', application_id: origin}, signedIn.body.enterprise_access_token, {Origin: origin});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('vary'), 'Origin');
  assert.equal(f.requests[0].body.user_id, f.config.userId);
  assert.equal(f.requests[0].body.os, 'web');
  assert.equal(f.requests[0].headers.origin, undefined);
  assert.equal(JSON.stringify(response.body).includes(f.config.integrationToken), false);
});
test('Web host rejects foreign origins and origin mismatch before forwarding bootstrap', async t => {
  const f = await fixture(t);
  const token = await login(f);
  const denied = await f.request('/api/auth/login', {username:f.config.fixtureUsername,password:f.config.fixturePassword},undefined,{Origin:'https://foreign.example'});
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  for (const body of [
    {...preparation, os:'web',application_id:'https://foreign.example'},
    {...preparation, os:'web',application_id:'http://127.0.0.1:5188',push_environment:'sandbox'},
    {...preparation, os:'android'},
  ]) {
    const response = await f.request('/api/voice/bootstrap',body,token,{Origin:'http://127.0.0.1:5188'});
    assert.equal(response.status,403);
  }
  assert.equal(f.requests.length,0);
});
test('Web preflight only permits known origin method and headers', async t => {
  const f=await fixture(t);
  const url=`http://127.0.0.1:${f.app.server.address().port}/api/voice/bootstrap`;
  const headers={Origin:'http://127.0.0.1:5188','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'};
  const allowed=await fetch(url,{method:'OPTIONS',headers});
  assert.equal(allowed.status,204);
  assert.equal(allowed.headers.get('access-control-allow-origin'),headers.Origin);
  assert.equal((await fetch(url,{method:'OPTIONS',headers:{...headers,'Access-Control-Request-Method':'DELETE'}})).status,403);
  assert.equal((await fetch(url,{method:'OPTIONS',headers:{...headers,'Access-Control-Request-Headers':'x-integration-token'}})).status,403);
});
