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
