# ADR-0004: Phased Account Principal Compatibility

- Status: Accepted
- Date: 2026-07-21

## Context

Token and family authorization require a stable account identifier. Existing
site sessions and storage remain keyed by a legacy login identifier, so changing
`userId` and the JWT subject in one release would create an unsafe all-or-nothing
data migration.

## Decision

Support an explicit versioned `/oauth/me` compatibility contract:

- `userId` normally identifies the active subject. For an explicit self
  principal only, it may remain the legacy login/storage owner during the
  phased window.
- `principal.actor.accountId` and `principal.subject.accountId` carry canonical
  authority.
- A differing `userId` is accepted only with
  `principalContractVersion: 2`, `userIdKind: "legacy-storage-owner"`, and an
  explicit self principal. The markers are invalid without a principal, when
  `userId` already equals the canonical subject, or on a delegated principal.
- The parser marks a validated explicit principal as `server-principal`.
  Legacy-only responses and local `setUserId` calls are marked
  `legacy-synthesized` and cannot establish Token or family authority.
- Browser callers cannot select an alias or subject. The server remains
  responsible for signing and revalidating account mappings and relationship
  authorization versions.
- Unknown versions, unknown alias kinds, partial or redundant markers,
  marker-only responses, delegated marker use, and unversioned subject/user
  mismatches fail closed.

The phased contract is additive. Existing non-sensitive consumers may continue
using `userId` for legacy storage compatibility, while subject-sensitive
consumers must require `authoritySource === "server-principal"` and use the
principal subject.

To preserve source compatibility in a 1.1 minor release, the three new
phased-authority properties are optional and read-only on the broad
`AuthContextType` and `AuthSessionIdentity` interfaces. The real provider
always supplies them, and the parsing and synthesis helpers return the narrower
`ResolvedAuthSessionIdentity` with all three properties present. An absent
property is deliberately equivalent to non-authority; it must never be inferred
as `server-principal`.

## Rollout and rollback

The host application controls issuance with
`auth.phased-account-principal.enabled`. Disabling issuance prevents new phased
sessions; it does not reinterpret an alias as canonical authority. The backend
must reject stale phased sessions and clear them on mapping-version changes.

## Consequences

- Positive: Token preview can use stable authority without moving unrelated
  owned data in the same release.
- Positive: Compatibility storage identity and authorization identity are
  distinguishable and independently testable.
- Positive: Local or synthesized identities cannot accidentally unlock
  subject-sensitive features.
- Positive: Existing 1.0.x structural context and session mocks compile
  unchanged against the 1.1 declarations.
- Negative: Consumers must deliberately choose between compatibility storage
  identity and canonical authority during the transition.
- Negative: The version-2 markers must remain supported until all relevant
  storage ownership is migrated and the host explicitly retires the contract.

## Alternatives Considered

- Change `userId` and JWT `sub` immediately: Rejected because it couples Token
  preview to a global owned-data migration.
- Trust an unversioned mismatch: Rejected because a malformed or browser-forged
  alias would become ambiguous authority.
- Treat synthesized legacy principals as authority: Rejected because their
  authentication time and subject were not issued by the server.
