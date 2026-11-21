# Enterprise fixture host

Node 24 stdlib server for the React Native secure-session demo. Enable the development fixture explicitly. The fixture uses one server-configured principal mapped to an existing Caresoft user ID. Production applications connect their existing enterprise IdP and account binding at this boundary.

## Configure the server

Create a private environment file outside the application source and build inputs. Restrict permissions to your user with `chmod 600`. Populate the following variables in your editor using your own tenant configuration.

```sh
VOICE_DEMO_FIXTURE_ENABLED=1
VOICE_DEMO_FIXTURE_USERNAME=fixture-customer
VOICE_DEMO_FIXTURE_PASSWORD=<choose-a-private-password-at-least-16-characters>
VOICE_DEMO_USER_ID=<preconfigured-caresoft-customer-id>
VOICE_GATEWAY_URL=https://voice.example.com
VOICE_ACCOUNT_ID=<account-id>
VOICE_APP_ID=<caresoft-app-id>
VOICE_INTEGRATION_TOKEN=<server-side-cvsk-credential>
VOICE_HOST_STATE_FILE=/private/path/voice-fixture-state.json
PORT=8787
```

The integration credential needs `voice.session.issue`, `voice.session.revoke` and `voice.session.read`, scoped to this account and app. Provision the configured user ID and verify customer ownership on the gateway. This fixture uses that preconfigured ID directly. Optional customer REST credentials belong in the enterprise backend's private configuration when extending its principal mapping.

Load the private environment file in your terminal and start the host from the demo repository.

```sh
set -a
. /private/path/voice-fixture.env
set +a
npm run host
```

The HTTP listener binds to `127.0.0.1`. Put a trusted development HTTPS reverse proxy in front of it and configure `enterpriseBackendUrl` with the HTTPS origin reachable from the phone or simulator. Set up DNS, certificate trust and firewall routing for that development environment. Both React Native and its generated native configuration require HTTPS. The fixture uses bearer authorization, and its responses carry `Cache-Control: no-store`.

For server-only tests against a gateway fixture on loopback, `VOICE_ALLOW_LOOPBACK_HTTP=1` allows HTTP to a loopback gateway. The application configuration continues to require HTTPS.

## Request flow

1. App posts username/password to `/api/auth/login`. The enabled fixture compares its configured credentials, applies a per-address failed-attempt limit and creates a fresh host-session UUID. The enterprise bearer stays in app memory. Passwords are cleared when the form closes.
2. App calls native `prepareLogin()`, then posts its seven public fields as snake_case to authenticated `/api/voice/bootstrap`. The host rejects unknown fields including user IDs and verifier overrides.
3. Host obtains `user_id` from its server-side fixture mapping and posts to `/{account}/api/v1/voice/session-tickets` with its integration bearer and host-session expiry. It returns only `login_ticket`, `attempt_id` and `expires_at`.
4. App invokes native `loginWithTicket`. Native owns verifier, token storage, refresh and Voice session restoration. Session metadata crosses the bridge.
5. App invokes local-first native logout and always tries authenticated `/api/auth/logout`. Host atomically persists its inactive session and revoke job before responding with HTTP 202. App can retry a failed delivery from the visible retry button while its JS process remains alive.

## Durable logout and status

The state file contains bearer hashes, host-session UUIDs and revoke jobs. It uses mode `0600`, atomic replacement, file and parent-directory fsync. A lock file enforces one writer, and stale locks are recovered after a process crash. The file is bound to the gateway/account/app and fixture principal mapping. Use a separate state file when changing that mapping. Keep the state file and its directory on durable local storage. Back it up with the same access restrictions.

The worker runs every five seconds. It posts HOST revocation using a persisted `X-Request-Id` UUID. A lost response causes a retry with the same UUID. After acceptance it persists `revocation_id` and polls the service status route until gateway `cleanup_status` is `done`, exposed as host status `completed`. Failures remain queued across restart. The worker retains pending jobs, attempt counts and timestamps for inspection.

`GET /api/auth/logout-status` accepts the same enterprise bearer after logout and returns only this host session's status, attempts and update time. The possible host statuses are `active`, `pending` and `completed`. Operators can inspect backlog metadata from the private state file without printing bearer values. Configure proxy/APM redaction for Authorization and all login/bootstrap bodies.

If the app is offline before the host receives logout, server revocation has a residual window. The demo retains a pending request in memory and offers retry. Closing the JS process clears the enterprise bearer, including that pending delivery. A production host must integrate its own durable enterprise logout delivery and session storage. Existing native Voice sessions can restore after restart independently of the fixture enterprise login. Host revocation completion and push/media teardown require a reachable, correctly configured gateway.

## Verification

```sh
npm run test:host
npm test
npm run typecheck
```

The host tests use real loopback HTTP fixture servers and temporary on-disk state. They cover fixture enablement, rejected credentials, unauthorized bootstrap, identity/verifier override rejection, principal binding, safe response projection, logout-before-delivery, restart recovery, stable retry UUIDs, fresh host-session UUIDs and pending/completed status.
