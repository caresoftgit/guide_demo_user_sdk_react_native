import type { CustomerVoiceClient } from '@caresoft/customer-voice-react-native';

type NativeSession = Pick<
  CustomerVoiceClient,
  'prepareLogin' | 'loginWithTicket' | 'logout'
>;

function hostError(code: string) {
  return Object.assign(new Error(code), { code });
}

export function createEnterpriseSession(
  hostUrl: string,
  native: NativeSession,
  transport: typeof fetch = fetch,
) {
  let enterpriseToken: string | undefined;
  let pendingLogout = false;

  async function request(route: string, body: object) {
    if (!/^https:\/\//.test(hostUrl)) {
      throw hostError('HTTPS_HOST_REQUIRED');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await transport(hostUrl.replace(/\/$/, '') + route, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(enterpriseToken
            ? { Authorization: `Bearer ${enterpriseToken}` }
            : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw hostError('ENTERPRISE_REQUEST_FAILED');
      }
      return await response.json();
    } catch {
      throw hostError('ENTERPRISE_REQUEST_FAILED');
    } finally {
      clearTimeout(timeout);
    }
  }

  async function retryLogout() {
    if (!enterpriseToken) {
      return;
    }
    pendingLogout = true;
    try {
      await request('/api/auth/logout', {});
      enterpriseToken = undefined;
      pendingLogout = false;
    } catch {
      throw hostError('HOST_LOGOUT_PENDING');
    }
  }

  return {
    get pendingLogout() {
      return pendingLogout;
    },
    async login(username: string, password: string) {
      if (enterpriseToken) {
        await retryLogout();
      }
      const authentication = await request('/api/auth/login', {
        username,
        password,
      });
      if (typeof authentication.enterprise_access_token !== 'string') {
        throw hostError('INVALID_ENTERPRISE_RESPONSE');
      }
      enterpriseToken = authentication.enterprise_access_token;
      const preparation = await native.prepareLogin();
      const ticket = await request('/api/voice/bootstrap', {
        attempt_id: preparation.attemptId,
        installation_id: preparation.installationId,
        os: preparation.platform,
        application_id: preparation.applicationId,
        push_environment: preparation.pushEnvironment,
        code_challenge: preparation.codeChallenge,
        code_challenge_method: preparation.codeChallengeMethod,
      });
      if (
        ticket.attempt_id !== preparation.attemptId ||
        typeof ticket.login_ticket !== 'string'
      ) {
        throw hostError('INVALID_ENTERPRISE_RESPONSE');
      }
      await native.loginWithTicket(preparation.attemptId, ticket.login_ticket);
    },
    async logout() {
      let nativeFailure: unknown;
      try {
        await native.logout();
      } catch (error) {
        nativeFailure = error;
      }
      await retryLogout();
      if (nativeFailure) {
        throw nativeFailure;
      }
    },
    retryLogout,
  };
}
