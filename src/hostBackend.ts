import type { LoginPreparation } from '@caresoft/customer-voice-react-native';

export type RequestTicket = (preparation: LoginPreparation) => Promise<string>;
// The application's transport owns authentication, redirect policy and native response-size limits.
export type HostRequestInit = RequestInit & {
  redirect: 'error';
  cache: 'no-store';
};
export type HostTransport = (
  url: string,
  options: HostRequestInit,
) => Promise<Pick<Response, 'status' | 'url' | 'text'>>;
type HostErrorCode =
  | 'HTTPS_HOST_REQUIRED'
  | 'INVALID_PREPARATION'
  | 'HOST_LOGIN_REQUIRED'
  | 'BOOTSTRAP_REQUEST_FAILED'
  | 'INVALID_BOOTSTRAP_RESPONSE';
export class HostBackendError extends Error {
  constructor(readonly code: HostErrorCode) {
    super(code);
    this.name = 'HostBackendError';
  }
}

export function createHostBackend(
  bootstrapUrl: string,
  transport: HostTransport,
): RequestTicket {
  return async preparation => {
    let endpoint: URL;
    try {
      endpoint = new URL(bootstrapUrl);
      if (
        endpoint.protocol !== 'https:' ||
        !endpoint.hostname ||
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash
      )
        throw new Error();
    } catch {
      throw new HostBackendError('HTTPS_HOST_REQUIRED');
    }
    const body = {
      attempt_id: preparation.attemptId,
      installation_id: preparation.installationId,
      os: preparation.platform,
      application_id: preparation.applicationId,
      push_environment: preparation.pushEnvironment,
      code_challenge: preparation.codeChallenge,
      code_challenge_method: preparation.codeChallengeMethod,
    };
    if (
      !Object.values(body).every(
        value => typeof value === 'string' && value.length > 0,
      )
    )
      throw new HostBackendError('INVALID_PREPARATION');
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await transport(endpoint.href, {
            method: 'POST',
            redirect: 'error',
            cache: 'no-store',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });
          if (response.url !== endpoint.href)
            throw new HostBackendError('BOOTSTRAP_REQUEST_FAILED');
          if (response.status === 401)
            throw new HostBackendError('HOST_LOGIN_REQUIRED');
          if (response.status < 200 || response.status >= 300)
            throw new HostBackendError('BOOTSTRAP_REQUEST_FAILED');
          const text = await response.text();
          if (
            text.length > 16384 ||
            encodeURIComponent(text).replace(/%[A-Fa-f0-9]{2}/g, 'x').length >
              16384
          )
            throw new HostBackendError('INVALID_BOOTSTRAP_RESPONSE');
          let data: unknown;
          try {
            data = JSON.parse(text);
          } catch {
            throw new HostBackendError('INVALID_BOOTSTRAP_RESPONSE');
          }
          const ticket = data as Record<string, unknown> | null;
          if (
            !ticket ||
            ticket.attempt_id !== preparation.attemptId ||
            typeof ticket.login_ticket !== 'string' ||
            !/^[A-Za-z0-9_-]{43}$/.test(ticket.login_ticket) ||
            typeof ticket.expires_at !== 'string' ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(
              ticket.expires_at,
            ) ||
            !Number.isFinite(Date.parse(ticket.expires_at))
          )
            throw new HostBackendError('INVALID_BOOTSTRAP_RESPONSE');
          return ticket.login_ticket;
        })(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new HostBackendError('BOOTSTRAP_REQUEST_FAILED'));
          }, 5000);
        }),
      ]);
    } catch (error) {
      if (error instanceof HostBackendError) throw error;
      throw new HostBackendError('BOOTSTRAP_REQUEST_FAILED');
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
    }
  };
}
