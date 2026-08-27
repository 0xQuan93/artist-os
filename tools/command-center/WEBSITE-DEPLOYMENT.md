# ArtistOS secure website handoff

## Deployment status

No website deployment has been performed. This document is a handoff contract,
not evidence that a domain, server, reverse proxy, certificate, firewall, backup,
or monitoring system is live.

ArtistOS remains a private Node.js application. For a website deployment, a
trusted reverse proxy must terminate public TLS and forward requests over a
private network to the Command Center's HTTP listener:

```text
collaborator browser
        |
        | HTTPS :443
        v
trusted TLS reverse proxy
        |
        | private HTTP only
        v
ArtistOS Node process :8989
```

The Node port is not a second public entrance. Restrict it with the host
firewall, container network, security group, and provider configuration so only
the trusted proxy can reach it. `ARTISTOS_PUBLIC_ORIGIN` describes the external
HTTPS origin; it does not add TLS to the Node server or make an exposed HTTP
port safe.

## Required production environment

Provide these values to the Node process through the deployment platform's
secret environment, using
[`artistos-web.env.example`](artistos-web.env.example) as the placeholder-only
template:

```dotenv
ARTISTOS_BIND_HOST=0.0.0.0
ARTISTOS_PUBLIC_ORIGIN=https://artistos.example.com
ARTISTOS_ACCESS_PASSCODE=replace-with-a-long-random-passcode
```

- `ARTISTOS_BIND_HOST=0.0.0.0` allows the private reverse proxy or container
  network to reach Node. It also makes firewall isolation mandatory.
- `ARTISTOS_PUBLIC_ORIGIN` must be the exact public HTTPS origin, with no path,
  query, fragment, or embedded credentials.
- `ARTISTOS_ACCESS_PASSCODE` enables the collaborator gate. Replace the
  placeholder before startup.
- Do not set `ARTISTOS_ALLOW_INSECURE_REMOTE=1` in a real deployment.

ArtistOS refuses a non-loopback bind without a configured passcode and HTTPS
public origin unless that explicit insecure override is present.

## Network boundary

Expose only the reverse proxy's HTTPS port, normally `443`.

Never expose any of the following to the internet:

- the Node origin port, normally `8989`;
- ACE's private service port `8001`;
- Remotion Studio, renderer, preview, or job-control ports;
- Vite, development, debugging, browser-control, or other render/dev ports;
- workspace directories, generated files, logs, or process-management panels.

Do not proxy, iframe, or link collaborators into ACE, Remotion Studio, or any
other native tool GUI. The public surface is the ArtistOS-owned shell and its
bounded APIs only. Optional engines remain private workers behind that surface.

The reverse proxy should:

- use a valid certificate and redirect public HTTP to HTTPS;
- forward requests only to the private ArtistOS origin;
- preserve request methods, cookies, response `Set-Cookie` headers, and byte
  range requests used by audio and video;
- set conservative request-size and timeout limits;
- avoid logging request bodies, `Cookie`, `Set-Cookie`, or
  `X-ArtistOS-CSRF` values;
- deny direct access to every non-ArtistOS service port.

If the proxy and Node run on different machines, permit the Node port only from
the proxy's private address. If they share a machine or container network, do
not publish the Node port through the host's public interface.

## Collaborator access model

The current website gate is deliberately small:

- everyone uses one shared passcode;
- a successful login creates a random, memory-only server session;
- the browser receives the session ID only in an `HttpOnly`,
  `SameSite=Strict` cookie;
- the cookie is marked `Secure` when the public origin is HTTPS;
- mutations require the session plus the matching `X-ArtistOS-CSRF` token;
- session state and login-rate-limit state are never written to disk.

The shared passcode is an access gate, not an identity system. It does not
provide individual accounts, roles, attribution, revocation by person, or an
audit trail of which collaborator performed an action. Share it only with
people authorized to see all data reachable through this ArtistOS instance.

Restarting Node clears every session and logs out every collaborator. Run one
Node process for the initial deployment. If multiple processes are introduced,
requests must remain sticky to the process that issued each session; otherwise
users will be logged out unpredictably. A shared session store would be a
separate future design and is not part of this handoff.

`GET /api/health` is intentionally public and redacted for the reverse proxy's
health check. It reports basic availability and safe access-mode metadata only;
it must not expose the workspace root, credentials, session values, private
records, or detailed integration state.

## Passcode handling and rotation

Use a long, randomly generated value stored in a password manager and the
deployment platform's secret manager. Do not place the real value in this
repository, an image, a client-side bundle, a URL, a support message, proxy
configuration, shell history, analytics, or logs. Limit access to the smallest
operator group and protect any local environment file with host-level file
permissions.

Rotate the passcode when a collaborator leaves, access may have leaked, or the
operator's rotation schedule requires it:

1. Generate and store a new random passcode.
2. Replace `ARTISTOS_ACCESS_PASSCODE` in the server-side secret environment.
3. Restart the single Node process so the new value is loaded.
4. Confirm every old session is rejected; restart already clears memory-only
   sessions.
5. Deliver the new passcode to authorized collaborators through the approved
   secret-sharing channel.

Never print either the old or new passcode while validating rotation.

## Pre-handoff checks

Before opening access to collaborators:

1. Keep the source repository and artist workspace private.
2. Confirm DNS and the TLS certificate match `ARTISTOS_PUBLIC_ORIGIN`.
3. Confirm the proxy is the only public listener and the Node origin cannot be
   reached from an external network.
4. Confirm ACE `8001` and every render/dev port are closed externally.
5. Start exactly one ArtistOS Node process with the required environment.
6. Run the Command Center tests and doctor check on the deployment artifact.
7. Review which workspace media and operational records authenticated
   collaborators will be able to access.
8. Back up the private workspace using the operator's approved encrypted
   process; sessions themselves require no backup.

Local approvals still do not authorize posting, uploading, publishing,
spending, minting, or messaging. Website access does not broaden those external
action boundaries.

## Smoke test

Set a shell variable to the public origin; it contains no secret:

```bash
ARTISTOS_SMOKE_ORIGIN=https://artistos.example.com
```

From a machine outside the server network, check the public shell and redacted
health response:

```bash
curl --fail-with-body --head "$ARTISTOS_SMOKE_ORIGIN/"
curl --fail-with-body --include "$ARTISTOS_SMOKE_ORIGIN/api/health"
curl --include "$ARTISTOS_SMOKE_ORIGIN/api/dashboard"
```

Expected results:

- `/` returns the ArtistOS shell over HTTPS;
- `/api/health` returns `200` with redacted availability/access fields and no
  filesystem path or secret;
- an unauthenticated `/api/dashboard` request returns `401`;
- attempting the private Node origin, ACE `8001`, or any render/dev port from
  the same external machine fails to connect.

Then use a private browser window:

1. Open the HTTPS origin and confirm the ArtistOS passcode gate appears inside
   the owned interface.
2. Enter the passcode and confirm the dashboard, Music Maker, Visual Maker,
   Asset Forge, and permitted workspace media load without exposing a native
   engine GUI.
3. In browser storage/security tools, confirm the session cookie is `HttpOnly`,
   `SameSite=Strict`, and `Secure`. Do not copy its value.
4. Perform one harmless, explicitly confirmed draft mutation and confirm it
   succeeds through the ArtistOS UI. Verify a request without the CSRF header is
   rejected with `403`.
5. Log out and confirm protected API and workspace-media requests return `401`.
6. Log in again, restart Node, and confirm the prior browser session is rejected.
7. Inspect proxy and application logs and confirm they contain no passcode,
   cookie, CSRF token, request body, or private workspace path.

Record the host, proxy, certificate, firewall, backup, smoke-test, and operator
approvals separately after they actually pass. Until then, deployment status
remains **not performed**.
