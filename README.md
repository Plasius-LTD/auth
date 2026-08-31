# @plasius/auth

[![npm version](https://img.shields.io/npm/v/@plasius/auth.svg)](https://www.npmjs.com/package/@plasius/auth)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Plasius-LTD/auth/ci.yml?branch=main&label=build&style=flat)](https://github.com/Plasius-LTD/auth/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/codecov/c/github/Plasius-LTD/auth)](https://codecov.io/gh/Plasius-LTD/auth)
[![License](https://img.shields.io/github/license/Plasius-LTD/auth)](./LICENSE)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-yes-blue.svg)](./CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/security%20policy-yes-orange.svg)](./SECURITY.md)
[![Changelog](https://img.shields.io/badge/changelog-md-blue.svg)](./CHANGELOG.md)

Authentication helpers and React context components for Plasius applications.

Apache-2.0. ESM + CJS builds. TypeScript types included.

---

## Requirements

- Node.js 24+ (matches `.nvmrc`)
- React 19 (`peerDependencies`)
- Browser runtime for hooks (`window`/`document` are used)

---

## Installation

```bash
npm install @plasius/auth
```

---

## Exports

```ts
import {
  AuthProvider,
  useAuth,
  useAuthorizedFetch,
  createAuthorizedFetch,
  useLogin,
  useLogout,
} from "@plasius/auth";
import type {
  ActorSubjectPrincipal,
  AgeAssuranceEvidence,
  PrincipalReference,
} from "@plasius/auth";
```

---

## Quick Start

```tsx
import { AuthProvider, useAuth, useLogin, useLogout } from "@plasius/auth";
import type { AuthProvider as OAuthProviderId } from "@plasius/entity-manager";

function AccountPanel() {
  const { userId, actor, subject, principal, validateSession } = useAuth();
  const login = useLogin();
  const logout = useLogout();
  const provider = "github" as OAuthProviderId;

  return (
    <div>
      <p>Signed in as: {userId ?? "anonymous"}</p>
      <p>Acting for: {subject?.accountId ?? actor?.accountId ?? "nobody"}</p>
      <p>Principal type: {principal?.principalType ?? "anonymous"}</p>
      <button onClick={() => login(provider)}>Log in</button>
      <button onClick={() => logout()}>Log out</button>
      <button onClick={() => validateSession()}>Revalidate session</button>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AccountPanel />
    </AuthProvider>
  );
}
```

---

## API

### `AuthProvider`

Provides auth state through context and runs session validation on mount.

### `useAuth()`

Returns:

- `userId: string | null`
- `readonly actor?: PrincipalReference | null`
- `readonly subject?: PrincipalReference | null`
- `readonly principal?: ActorSubjectPrincipal | null`
- `readonly authoritySource?: "server-principal" | "legacy-synthesized" | null`
- `readonly principalContractVersion?: 2 | null`
- `readonly userIdKind?: "legacy-storage-owner" | null`
- `setUserId(userId: string | null)`
- `validateSession(): Promise<void>`

`AuthProvider` always supplies all six added principal and phased-authority
properties at runtime. They are optional and read-only in the broad public
`AuthContextType` so object-literal mocks written for 1.0.x remain assignable
in the 1.1 minor release. Treat an omitted value exactly like `null`: it does
not establish authority.

`userId` remains a backwards-compatible convenience identifier and normally
equals `subject.accountId`, including for delegated-child sessions. During the
versioned phased-account transition it may instead retain a self account's
legacy storage identifier only when `/oauth/me` also returns
`principalContractVersion: 2` and
`userIdKind: "legacy-storage-owner"`. Token and family authorization must use
the server principal's subject, never `userId`.

The version-2 compatibility markers are valid only with an explicit self
principal and a genuine `userId`/subject mismatch. Marker-only responses,
redundant markers on an already-canonical `userId`, and markers attached to a
delegated principal all fail closed.

`setUserId()` remains available for existing login integrations and creates a
local self principal marked `authoritySource: "legacy-synthesized"`. That
fallback cannot authorize Token, family, or other subject-sensitive behavior.
Only a validated explicit principal returned by `/oauth/me` is marked
`authoritySource: "server-principal"`.

`validateSession()` calls `GET /oauth/me`, validates the complete response, and
atomically updates the complete identity, including authority provenance and
compatibility markers. A malformed, ambiguous, expired, future-dated, or
unversioned alias response clears the auth state. Actor and subject are
server-authoritative only when `authoritySource` is `server-principal`;
otherwise they are compatibility-only. This package does not add
subject-selection headers to requests.

### 1.1 phased-principal migration

Existing `AuthContextType` and `AuthSessionIdentity` structural mocks do not
need to add principal or phased-authority properties. The exact v1.0.20 context
shape—`userId`, `setUserId`, and `validateSession`—remains assignable.
`actor`, `subject`, `principal`, `authoritySource`,
`principalContractVersion`, and `userIdKind` are optional, read-only context
additions. `parseAuthMeResponse()` and `createLegacySelfIdentity()` return
`ResolvedAuthSessionIdentity`, whose normalized metadata is always present.

Subject-sensitive consumers must deny access unless provenance is explicitly
server-issued:

```ts
const auth = useAuth();

if (auth.authoritySource !== "server-principal" || !auth.subject) {
  // Conceal or disable subject-sensitive behavior.
  return;
}

const authoritativeSubjectId = auth.subject.accountId;
```

Do not use truthiness or the presence of `principal` alone:
`legacy-synthesized` principals and older mocks are compatibility state, not
authorization evidence.

### `useAuthorizedFetch()`

React hook that returns an authorized fetch wrapper.

### `createAuthorizedFetch()`

Non-hook function that creates the same authorized fetch wrapper.

Behavior:

- Always sends requests with `credentials: "include"`.
- Preserves caller headers supplied as a `Headers` instance, tuple array, or
  plain object without mutating the caller-owned initializer.
- Reads `csrf-token` from browser cookies and sends it as `x-csrf-token` when present.
  The cookie-derived token takes precedence over a caller-supplied CSRF header.
- On `401`, calls `POST /oauth/refresh-token` and retries the original request.
- Deduplicates concurrent refresh calls with a shared promise.
- Limits refresh to one retry cycle per request (prevents recursive retry loops).
- Applies cooldown after refresh failure or repeated `401` so clients return failure instead of repeatedly hitting auth endpoints.
- For outage responses (`429`/`5xx`) on refresh, uses randomized logarithmic backoff with an increasing cooldown window.
- Honors RFC 9110 `Retry-After` integer seconds or HTTP dates from refresh
  responses, capped at five minutes; malformed values are ignored.

### `useLogin()`

Returns a function that redirects to:

- `/oauth/{provider}?state={base64url(UTF-8 currentPath)}`

The provider identifier type comes from `@plasius/entity-manager` (`AuthProvider`), and is separate from this package's React `AuthProvider` component.

### `useLogout()`

Returns a function that:

1. Sends `POST /oauth/logout`.
2. Redirects the browser to `/` regardless of request outcome.

---

## Server Integration Guide

This package is frontend-only. It assumes your backend owns authentication and issues cookies.

### End-to-End Flow

1. User clicks login and `useLogin()` redirects browser to `GET /oauth/{provider}?state={base64url(UTF-8 path)}`.

Runtime rollout inherits `governance.rfc-compliance-remediation.enabled`.
Enabled consumers use strict retry parsing and Unicode-safe state encoding;
rollback disables the flag and restores the prior package during the migration
window.
2. Backend starts OAuth with the provider, completes callback handling, then sets auth cookies.
3. `AuthProvider` calls `GET /oauth/me` on mount to populate the actor/subject
   principal and the backwards-compatible active-subject `userId`.
4. API calls through `useAuthorizedFetch()` include cookies and optional `x-csrf-token`.
5. If a protected call returns `401`, package sends `POST /oauth/refresh-token` once for concurrent callers.
6. On successful refresh, original request is retried automatically.
7. `useLogout()` sends `POST /oauth/logout` then redirects to `/`.

### Required API Contract

| Route | Method | Called by | Required behavior |
| --- | --- | --- | --- |
| `/oauth/{provider}` | `GET` | `useLogin()` | Start provider login flow; accept `state` query param. |
| `/oauth/me` | `GET` | `AuthProvider.validateSession()` | Return `200` with a legacy `userId`, a validated `principal`, or both when authenticated; otherwise non-2xx (typically `401`). |
| `/oauth/refresh-token` | `POST` | `createAuthorizedFetch()` after `401` | Attempt token/session refresh using cookies; return `2xx` on success, non-2xx on failure. |
| `/oauth/logout` | `POST` | `useLogout()` | Invalidate session cookies/server session and return `2xx`/`204` when possible. |

### Endpoint Response Shapes

`GET /oauth/me` success example:

```json
{
  "userId": "user_123"
}
```

Legacy responses synthesize a self principal. Its `authenticatedAt` value is
the time at which the client observed the valid response, because the legacy
contract does not expose the server authentication time. This identity is
marked `legacy-synthesized` and is not authority for Token or family features.

Phased canonical-authority response retaining a legacy storage owner:

```json
{
  "userId": "legacy-storage-owner-001",
  "principalContractVersion": 2,
  "userIdKind": "legacy-storage-owner",
  "principal": {
    "actor": {
      "accountId": "acct_00000000-0000-4000-8000-000000000001",
      "accountType": "user"
    },
    "subject": {
      "accountId": "acct_00000000-0000-4000-8000-000000000001",
      "accountType": "user"
    },
    "principalType": "self",
    "authenticatedAt": "2026-07-21T12:00:00.000Z"
  }
}
```

Canonical actor/subject response:

```json
{
  "userId": "managed-child-001",
  "principal": {
    "actor": {
      "accountId": "guardian-account-001",
      "accountType": "user"
    },
    "subject": {
      "accountId": "managed-child-001",
      "accountType": "managed-child"
    },
    "principalType": "guardian-delegated",
    "relationshipId": "guardian-relationship-001",
    "authorizationVersion": 1,
    "ageBand": "6-9",
    "assurance": {
      "level": "guardian-attested",
      "method": "guardian-attestation",
      "assertedAt": "2026-07-15T09:00:00.000Z",
      "expiresAt": "2027-07-15T09:00:00.000Z"
    },
    "authenticatedAt": "2026-07-15T09:05:00.000Z"
  }
}
```

Supported age bands are `5`, `6-9`, `10-12`, `13-15`, `16-17`, and
`18+`. `assurance` is age-assurance evidence, not MFA or authentication AAL.
It deliberately excludes exact birth dates and provider payloads.
An internal provider evidence reference may be omitted from this public
principal after the server has validated and minimized the assurance record.
`provider-asserted` / `provider-age-signal` represents only a positive adult
category from an external account provider. It is accepted only for an `18+`
self principal, never a delegated child, and is deliberately distinct from
`verified`; financial and reward-provider policies must continue to require
their higher assurance level.

During migration, `principals` is accepted as an alias only when it contains
exactly one valid principal (either directly or as a one-element array). If
both `principal` and `principals` are supplied, they must normalize to the same
value. New integrations should emit only `principal`.

`GET /oauth/me` should return `401` (or another non-2xx) when no valid session exists.

For delegated principals, the backend must verify the relationship is active,
`authorizationVersion` is current, age assurance is sufficient, and guardian
step-up requirements are satisfied before emitting the response. Client-side
shape validation is defense in depth and cannot replace server authorization.

`POST /oauth/refresh-token` may optionally return a `Retry-After` response header (seconds).  
If present and greater than zero, the package waits before retrying the original request.

### Cookies, CSRF, and Headers

- Auth/session cookie must be sent on credentialed requests (`credentials: "include"` is always used).
- For CSRF protection, expose a readable cookie named `csrf-token` if you want the package to send `x-csrf-token`.
- `useAuthorizedFetch()` adds `x-csrf-token` only when the `csrf-token` cookie exists.
- Actor/subject identity is read only from `/oauth/me`; no subject ID or
  relationship is derived from browser-supplied headers.
- Refresh calls use the same authorized wrapper and include `x-csrf-token` when
  the readable cookie exists; also protect this route with cookie policy and
  origin checks.
- `useLogout()` uses authorized fetch, so logout receives `x-csrf-token` when available.

### Cross-Origin Deployment (If API and App Origins Differ)

Configure backend CORS and cookies for credentialed requests:

- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Origin` must be a specific origin, not `*`
- Session cookies should use `Secure` and an appropriate `SameSite` policy for your topology.

### Security Notes for `/oauth/{provider}` `state`

`state` is set by the client as `base64(window.location.pathname)`. Backend should:

- Treat `state` as untrusted input.
- Validate/decode safely.
- Restrict post-login redirects to allowed in-app paths to prevent open redirects.

### Minimal Backend Checklist

- Implement all four routes above.
- Issue and clear session cookies reliably.
- Return legacy `userId` and/or a server-authorized actor/subject `principal`
  from `/oauth/me`. When they differ, require the exact version-2
  `legacy-storage-owner` markers on a self principal; never accept a
  browser-selected alias or use those markers for delegated principals.
- Authorize Token and family operations from the server principal subject.
  Treat legacy-only and locally synthesized principals as compatibility state,
  not authority.
- Reject stale delegated relationship versions on the server and never inherit
  guardian roles into the child subject.
- Return `401` for expired/invalid sessions.
- Make `/oauth/refresh-token` idempotent and safe for concurrent requests.
- Enforce CSRF/origin protections for state-changing endpoints.

### Family-account rollout

Delegated principal issuance is controlled by the parent feature flag
`profile.family-accounts.enabled`, evaluated by the site backend. When disabled,
the backend stops issuing new delegated sessions and continues returning safe
self/legacy sessions. Consumer UI discoverability and entitlements remain the
site capability layer's responsibility; this public package does not evaluate
host feature flags or capabilities.

---

## OAuth 2.0 Standards Alignment

This package is designed to align with OAuth 2.0 and current IETF security guidance when paired with a compliant backend.

### Core Standards

- OAuth 2.0 Framework (RFC 6749): <https://www.rfc-editor.org/info/rfc6749>
- Bearer Token Usage (RFC 6750): <https://www.rfc-editor.org/info/rfc6750>
- PKCE for Authorization Code Grant (RFC 7636): <https://www.rfc-editor.org/info/rfc7636>
- Token Revocation (RFC 7009): <https://www.rfc-editor.org/info/rfc7009>
- Authorization Server Metadata (RFC 8414): <https://www.rfc-editor.org/info/rfc8414>
- OAuth 2.0 Security Best Current Practice (RFC 9700 / BCP 240): <https://www.rfc-editor.org/info/rfc9700>

### Browser-Based App Guidance

- OAuth 2.0 for Browser-Based Applications (IETF WG draft, latest): <https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/>

### Practical Alignment Notes for This Package

- The frontend uses a server-backed session model (cookie-based), which helps avoid exposing long-lived OAuth tokens to browser JavaScript.
- The backend should use Authorization Code + PKCE with the identity provider.
- The backend should enforce exact redirect URI matching and reject open redirects.
- The backend should treat the incoming `state` value as untrusted input.
- The backend should generate and validate its own CSRF correlation/anti-forgery value for OAuth redirects and state-changing endpoints.
- The backend should revoke or invalidate tokens/sessions during logout.
- The backend should use HTTPS everywhere and secure cookie settings (`Secure`, `HttpOnly`, `SameSite` aligned to deployment topology).

### Compliance Checklist (Backend)

- Do not use Implicit Grant or Resource Owner Password Credentials flows.
- Use Authorization Code grant with PKCE for user login.
- Validate redirect URIs exactly against registered values.
- Protect state-changing endpoints (`/oauth/logout`, `/oauth/refresh-token`) against CSRF.
- Avoid putting access tokens in URL query parameters.
- Return non-2xx for invalid sessions and avoid leaking sensitive error detail.

---

## Build Outputs

The package publishes:

- ESM bundle: `dist/index.js`
- CJS bundle: `dist/index.cjs`
- Type definitions: `dist/index.d.ts`

---

## Development

```bash
npm run clean
npm run build
npm test
npm run test:coverage
npm run lint
```

Demo scaffold:

```bash
npm run build
node demo/example.mjs
```

---

## Release Policy

Package publishing is performed through GitHub CD workflows only. Do not publish directly from local machines.

---

## Contributing

- Open issues/PRs at [Plasius-LTD/auth](https://github.com/Plasius-LTD/auth).
- Read [CONTRIBUTING.md](./CONTRIBUTING.md), [SECURITY.md](./SECURITY.md), and [CHANGELOG.md](./CHANGELOG.md).

<!-- BEGIN PLASIUS RELEASE INTEGRITY -->
## Release integrity

CI keeps the administrative contributor registry outside Git and npm package
artifacts using exact, case-normalised path checks. CI runs on approved
self-hosted runners for same-repository pull requests and `main`; fork PR code
is denied. Publication uses the GitHub-hosted `production` job with Node 24 and
npm 11.5.1 or newer. It is token-free and proceeds only while the prepared SHA
is the exact `main` head after successful push-triggered CI. Do not dispatch CD
until the npm trusted-publisher binding is verified.
<!-- END PLASIUS RELEASE INTEGRITY -->
