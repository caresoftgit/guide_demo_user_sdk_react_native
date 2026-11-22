import { createEnterpriseSession } from '../src/enterpriseSession';
const preparation = {
  attemptId: 'attempt',
  installationId: 'installation',
  platform: 'android',
  applicationId: 'com.customervoicedemo',
  pushEnvironment: 'default',
  codeChallenge: 'challenge',
  codeChallengeMethod: 'S256',
};
function fixture() {
  const calls: Array<{ url: string; body: any; authorization?: string }> = [];
  let hostUnavailable = false;
  const transport = async (url: string, options: any) => {
    calls.push({
      url,
      body: JSON.parse(options.body || '{}'),
      authorization: options.headers.Authorization,
    });
    if (hostUnavailable) throw new Error('transport-private-detail');
    const body = url.endsWith('/login')
      ? { enterprise_access_token: 'enterprise-memory-token' }
      : url.endsWith('/bootstrap')
      ? { attempt_id: 'attempt', login_ticket: 'one-use-ticket' }
      : { status: 'pending' };
    return { ok: true, json: async () => body };
  };
  const exchanged: any[] = [];
  const native = {
    prepareLogin: async () => preparation,
    loginWithTicket: async (...args: any[]) => {
      exchanged.push(args);
    },
    logout: async () => {},
  };
  const session = createEnterpriseSession(
    'https://host.example',
    native as any,
    transport as any,
  );
  return {
    session,
    calls,
    exchanged,
    native,
    set hostUnavailable(value: boolean) {
      hostUnavailable = value;
    },
  };
}
test('enterprise bootstrap uses authenticated host identity and public preparation', async () => {
  const f = fixture();
  await f.session.login('fixture-customer', 'fixture-password');
  expect(f.calls[1]).toEqual({
    url: 'https://host.example/api/voice/bootstrap',
    authorization: 'Bearer enterprise-memory-token',
    body: {
      attempt_id: 'attempt',
      installation_id: 'installation',
      os: 'android',
      application_id: 'com.customervoicedemo',
      push_environment: 'default',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
    },
  });
  expect(f.exchanged).toEqual([['attempt', 'one-use-ticket']]);
});
test('host logout is attempted after native local cleanup reports revoke failure', async () => {
  const f = fixture();
  await f.session.login('fixture-customer', 'fixture-password');
  f.native.logout = async () => {
    throw Object.assign(new Error('local'), {
      code: 'LOGOUT_REVOKE_UNCONFIRMED',
    });
  };
  await expect(f.session.logout()).rejects.toMatchObject({
    code: 'LOGOUT_REVOKE_UNCONFIRMED',
  });
  expect(f.calls.at(-1)?.url).toBe('https://host.example/api/auth/logout');
});
test('offline host logout remains retryable with same enterprise session', async () => {
  const f = fixture();
  await f.session.login('fixture-customer', 'fixture-password');
  f.hostUnavailable = true;
  await expect(f.session.logout()).rejects.toMatchObject({
    code: 'HOST_LOGOUT_PENDING',
  });
  f.hostUnavailable = false;
  await f.session.retryLogout();
  expect(f.calls.at(-1)?.authorization).toBe('Bearer enterprise-memory-token');
});
test('logout while enterprise login is pending never starts SDK login', async () => {
  let resolve!: (value: any) => void;
  const response = new Promise(r => {
    resolve = r;
  });
  const prepareLogin = jest.fn(async () => preparation);
  const transport = jest.fn(async (url: any) =>
    String(url).endsWith('/login')
      ? response
      : { ok: true, json: async () => ({}) },
  );
  const session = createEnterpriseSession(
    'https://host.example',
    { prepareLogin, loginWithTicket: jest.fn(), logout: jest.fn() } as any,
    transport as any,
  );
  const attempt = session.login('name', 'password');
  const rejected = expect(attempt).rejects.toMatchObject({
    code: 'LOGIN_ATTEMPT_SUPERSEDED',
  });
  await session.logout();
  resolve({
    ok: true,
    json: async () => ({ enterprise_access_token: 'late-token' }),
  });
  await rejected;
  expect(prepareLogin).not.toHaveBeenCalled();
  expect(transport).toHaveBeenCalledWith(
    'https://host.example/api/auth/logout',
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer late-token' }),
    }),
  );
});
test('a delayed logout revokes its captured host session, never the next user', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => {
    release = resolve;
  });
  const revoked: string[] = [];
  let count = 0;
  const native = {
    prepareLogin: async () => preparation,
    loginWithTicket: async () => {},
    logout: async () => pending,
  };
  const transport = async (url: any, opts: any) => {
    const route = String(url);
    if (route.endsWith('/logout')) revoked.push(opts.headers.Authorization);
    return {
      ok: true,
      json: async () =>
        route.endsWith('/login')
          ? { enterprise_access_token: `host-${++count}` }
          : { attempt_id: 'attempt', login_ticket: 'ticket' },
    };
  };
  const host = createEnterpriseSession(
    'https://host.example',
    native as any,
    transport as any,
  );
  await host.login('A', 'password');
  const logout = host.logout();
  await host.login('B', 'password');
  release();
  await logout;
  expect(revoked).toEqual(['Bearer host-1', 'Bearer host-1']);
  await host.retryLogout();
  expect(revoked.at(-1)).toBe('Bearer host-2');
});
