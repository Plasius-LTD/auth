# @plasius/auth

[![npm version](https://img.shields.io/npm/v/@plasius/auth.svg)](https://www.npmjs.com/package/@plasius/auth)
[![Build Status](https://img.shields.io/github/actions/workflow/status/Plasius-LTD/auth/ci.yml?branch=main&label=build&style=flat)](https://github.com/Plasius-LTD/auth/actions/workflows/ci.yml)
[![coverage](https://img.shields.io/codecov/c/github/Plasius-LTD/auth)](https://codecov.io/gh/Plasius-LTD/auth)
[![License](https://img.shields.io/github/license/Plasius-LTD/auth)](./LICENSE)
[![Code of Conduct](https://img.shields.io/badge/code%20of%20conduct-yes-blue.svg)](./CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/security%20policy-yes-orange.svg)](./SECURITY.md)
[![Changelog](https://img.shields.io/badge/changelog-md-blue.svg)](./CHANGELOG.md)

[![CI](https://github.com/Plasius-LTD/auth/actions/workflows/ci.yml/badge.svg)](https://github.com/Plasius-LTD/auth/actions/workflows/ci.yml)
[![CD](https://github.com/Plasius-LTD/auth/actions/workflows/cd.yml/badge.svg)](https://github.com/Plasius-LTD/auth/actions/workflows/cd.yml)

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
```

---

## Quick Start

```tsx
import { AuthProvider, useAuth, useLogin, useLogout } from "@plasius/auth";
import type { AuthProvider as OAuthProviderId } from "@plasius/entity-manager";

function AccountPanel() {
  const { userId, validateSession } = useAuth();
  const login = useLogin();
  const logout = useLogout();
  const provider = "github" as OAuthProviderId;

  return (
    <div>
      <p>Signed in as: {userId ?? "anonymous"}</p>
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
- `setUserId(userId: string | null)`
- `validateSession(): Promise<void>`

`validateSession()` calls `GET /oauth/me` and updates `userId` from a `userId` field in the response body.

### `useAuthorizedFetch()`

React hook that returns an authorized fetch wrapper.

### `createAuthorizedFetch()`

Non-hook function that creates the same authorized fetch wrapper.

Behavior:

- Always sends requests with `credentials: "include"`.
- Reads `csrf-token` from browser cookies and sends it as `x-csrf-token` when present.
- On `401`, calls `POST /oauth/refresh-token` and retries the original request.
- Deduplicates concurrent refresh calls with a shared promise.
- Limits refresh to one retry cycle per request (prevents recursive retry loops).
- Applies cooldown after refresh failure or repeated `401` so clients return failure instead of repeatedly hitting auth endpoints.
- For outage responses (`429`/`5xx`) on refresh, uses randomized logarithmic backoff with an increasing cooldown window.
- Honors `Retry-After` (seconds) from refresh responses before retrying.

### `useLogin()`

Returns a function that redirects to:

- `/oauth/{provider}?state={base64(currentPath)}`

The provider identifier type comes from `@plasius/entity-manager` (`AuthProvider`), and is separate from this package's React `AuthProvider` component.

### `useLogout()`

Returns a function that:

1. Sends `POST /oauth/logout`.
2. Redirects the browser to `/` regardless of request outcome.

---

## Server Integration Guide

This package is frontend-only. It assumes your backend owns authentication and issues cookies.

### End-to-End Flow

1. User clicks login and `useLogin()` redirects browser to `GET /oauth/{provider}?state={base64(path)}`.
2. Backend starts OAuth with the provider, completes callback handling, then sets auth cookies.
3. `AuthProvider` calls `GET /oauth/me` on mount to populate `userId`.
4. API calls through `useAuthorizedFetch()` include cookies and optional `x-csrf-token`.
5. If a protected call returns `401`, package sends `POST /oauth/refresh-token` once for concurrent callers.
6. On successful refresh, original request is retried automatically.
7. `useLogout()` sends `POST /oauth/logout` then redirects to `/`.

### Required API Contract

| Route | Method | Called by | Required behavior |
| --- | --- | --- | --- |
| `/oauth/{provider}` | `GET` | `useLogin()` | Start provider login flow; accept `state` query param. |
| `/oauth/me` | `GET` | `AuthProvider.validateSession()` | Return `200` with JSON containing `userId` when authenticated, otherwise non-2xx (typically `401`). |
| `/oauth/refresh-token` | `POST` | `createAuthorizedFetch()` after `401` | Attempt token/session refresh using cookies; return `2xx` on success, non-2xx on failure. |
| `/oauth/logout` | `POST` | `useLogout()` | Invalidate session cookies/server session and return `2xx`/`204` when possible. |

### Endpoint Response Shapes

`GET /oauth/me` success example:

```json
{
  "userId": "user_123"
}
```

`GET /oauth/me` should return `401` (or another non-2xx) when no valid session exists.

`POST /oauth/refresh-token` may optionally return a `Retry-After` response header (seconds).  
If present and greater than zero, the package waits before retrying the original request.

### Cookies, CSRF, and Headers

- Auth/session cookie must be sent on credentialed requests (`credentials: "include"` is always used).
- For CSRF protection, expose a readable cookie named `csrf-token` if you want the package to send `x-csrf-token`.
- `useAuthorizedFetch()` adds `x-csrf-token` only when the `csrf-token` cookie exists.
- Refresh calls to `/oauth/refresh-token` do not include `x-csrf-token` automatically; protect this route with cookie policy and origin checks.
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
- Return `userId` from `/oauth/me` for authenticated sessions.
- Return `401` for expired/invalid sessions.
- Make `/oauth/refresh-token` idempotent and safe for concurrent requests.
- Enforce CSRF/origin protections for state-changing endpoints.

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
