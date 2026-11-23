import { createHostBackend, type HostTransport } from '../src/hostBackend';
import type { LoginPreparation } from '@caresoft/customer-voice-react-native';
const url = 'https://app.example.com/api/voice/bootstrap';
const p: LoginPreparation = {
  attemptId: 'attempt',
  installationId: 'installation',
  platform: 'android',
  applicationId: 'com.example.CustomerApp',
  pushEnvironment: 'default',
  codeChallenge: 'C'.repeat(43),
  codeChallengeMethod: 'S256',
};
const valid = {
  attempt_id: 'attempt',
  login_ticket: 'T'.repeat(43),
  expires_at: '2030-01-01T00:00:00.000Z',
};
function response(body: unknown = valid, status = 200, responseUrl = url) {
  return { status, url: responseUrl, text: async () => JSON.stringify(body) };
}

test('bootstrap projects only seven public fields through the supplied application client', async () => {
  const transport = jest.fn<
    ReturnType<HostTransport>,
    Parameters<HostTransport>
  >(async () => response());
  const ticket = await createHostBackend(
    url,
    transport,
  )({
    ...p,
    user_id: 'client-override',
    code_verifier: 'private',
    api_token: 'private',
  } as any);
  expect(ticket).toBe('T'.repeat(43));
  const [endpoint, options] = transport.mock.calls[0];
  expect(endpoint).toBe(url);
  expect(options.method).toBe('POST');
  expect(options.redirect).toBe('error');
  expect(options.headers).not.toHaveProperty('Authorization');
  expect(JSON.parse(options.body as string)).toEqual({
    attempt_id: 'attempt',
    installation_id: 'installation',
    os: 'android',
    application_id: 'com.example.CustomerApp',
    push_environment: 'default',
    code_challenge: 'C'.repeat(43),
    code_challenge_method: 'S256',
  });
});
test.each([
  'http://app.example.com/api',
  'https://name:password@app.example.com/api',
  'https://app.example.com/api?token=x',
  'https://app.example.com/api#secret',
])('rejects unsafe bootstrap URL %s before sending', async endpoint => {
  const transport = jest.fn(async () => response());
  await expect(createHostBackend(endpoint, transport)(p)).rejects.toMatchObject(
    { code: 'HTTPS_HOST_REQUIRED' },
  );
  expect(transport).not.toHaveBeenCalled();
});
test('a missing preparation field is rejected before calling the app client', async () => {
  const transport = jest.fn(async () => response());
  await expect(
    createHostBackend(url, transport)({ ...p, codeChallenge: '' }),
  ).rejects.toMatchObject({ code: 'INVALID_PREPARATION' });
  expect(transport).not.toHaveBeenCalled();
});
test('an expired application session requests host login without exposing the response', async () => {
  await expect(
    createHostBackend(url, async () =>
      response({ message: 'private server detail' }, 401),
    )(p),
  ).rejects.toMatchObject({
    code: 'HOST_LOGIN_REQUIRED',
    message: 'HOST_LOGIN_REQUIRED',
  });
});
test('unexpected response URL and network failures are sanitized', async () => {
  await expect(
    createHostBackend(url, async () =>
      response(valid, 200, 'https://other.example.com'),
    )(p),
  ).rejects.toMatchObject({ code: 'BOOTSTRAP_REQUEST_FAILED' });
  await expect(
    createHostBackend(url, async () => {
      throw new Error('secret transport detail');
    })(p),
  ).rejects.toMatchObject({ message: 'BOOTSTRAP_REQUEST_FAILED' });
});
test.each([
  { ...valid, attempt_id: 'another' },
  { ...valid, login_ticket: 'short' },
  { ...valid, expires_at: 123 },
  { ...valid, expires_at: '1' },
  null,
])('rejects malformed or mismatched bootstrap data', async body => {
  await expect(
    createHostBackend(url, async () => response(body))(p),
  ).rejects.toMatchObject({ code: 'INVALID_BOOTSTRAP_RESPONSE' });
});
test('oversized UTF-8 JSON and invalid JSON are rejected', async () => {
  await expect(
    createHostBackend(url, async () =>
      response({ ...valid, padding: 'ữ'.repeat(6000) }),
    )(p),
  ).rejects.toMatchObject({ code: 'INVALID_BOOTSTRAP_RESPONSE' });
  await expect(
    createHostBackend(url, async () => ({
      status: 200,
      url,
      text: async () => '{',
    }))(p),
  ).rejects.toMatchObject({ code: 'INVALID_BOOTSTRAP_RESPONSE' });
});
test('the deadline aborts and rejects even when a transport ignores its signal', async () => {
  jest.useFakeTimers();
  let signal: AbortSignal | undefined;
  const transport: HostTransport = async (_, options) => {
    signal = options.signal!;
    return new Promise(() => {});
  };
  const operation = createHostBackend(url, transport)(p);
  const rejected = expect(operation).rejects.toMatchObject({
    code: 'BOOTSTRAP_REQUEST_FAILED',
  });
  await jest.advanceTimersByTimeAsync(5000);
  await rejected;
  expect(signal?.aborted).toBe(true);
  jest.useRealTimers();
});
