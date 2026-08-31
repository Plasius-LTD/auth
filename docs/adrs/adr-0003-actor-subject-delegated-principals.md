# ADR-0003: Actor-Subject Delegated Principals

- Status: Accepted
- Date: 2026-07-15

## Context

Managed-child sessions need to distinguish the adult account that authenticated
(the actor) from the child account for which a request is evaluated (the
subject). The existing `AuthContext.userId` contract identifies only one account
and is already consumed as the authenticated user across Plasius applications.

The parent family-account feature is remotely controlled by
`profile.family-accounts.enabled`. The site backend is the source-of-truth flag,
relationship, age-assurance, and authorization evaluator. A browser library
cannot determine whether a relationship authorization version is current.

## Decision

Add a structurally shared `ActorSubjectPrincipal` contract to `@plasius/auth`:

- `actor` and `subject` are minimal account references.
- `self` requires equal user actor/subject references and carries no
  relationship authorization.
- `guardian-delegated` requires a user actor, a different managed-child subject,
  relationship ID, positive safe-integer authorization version, minor age
  band, age-assurance evidence, and a non-future authentication time.
- Age assurance contains only level, method, timestamps, and an optional opaque
  evidence reference. Exact birth data and provider payloads are not retained.
  The public principal remains valid when an internal evidence reference has
  been deliberately removed during schema serialization.
- A positive external account-provider adult category is carried as the
  distinct `provider-asserted` / `provider-age-signal` pair. It is valid only
  for an `18+` self principal and is rejected for delegated children. It does
  not satisfy policies that require `verified` assurance.
- Unknown principal fields, including roles, are discarded. Guardian roles are
  never copied into child-subject context.

`GET /oauth/me` uses `principal` as the canonical field. A `principals` migration
alias is accepted only for one valid value; if both keys are present they must
agree. Any malformed or ambiguous actor/subject response fails closed.

For backwards compatibility, `{ "userId": "..." }` synthesizes a self
principal. The synthesized identity and local `setUserId` state are explicitly
marked as compatibility state rather than server authority. `userId` normally
matches `principal.subject.accountId`; the separately documented phased account
contract permits a versioned legacy storage alias only for an explicit self
principal while canonical authority is carried by the server principal.
Delegated principals cannot use those compatibility markers. No subject setter
or subject-selection request header is added.

The public response omits the entity schema's `type`/`version` envelope while
remaining structurally compatible with its scalar principal fields. This keeps
the OAuth response composable and avoids coupling browser callers to persistence
schema envelopes.

The provider always supplies `actor`, `subject`, and `principal`, but those
properties are optional and read-only on the broad `AuthContextType`. This
preserves source compatibility with the exact v1.0.20 structural context shape
for a 1.1 minor release. Absence in an older mock is non-authoritative and cannot
be used to select a subject.

## Rollout and rollback

The site backend may emit delegated principals only when
`profile.family-accounts.enabled` and its server-side authorization policy allow
it. Flag disablement stops new delegated-session issuance while legacy and self
sessions continue to work. UI capability decisions remain owned by the host
application. Rolling back the backend to self-only responses does not require a
client API rollback.

## Consequences

- Positive: Existing self-session callers keep their `userId` behavior, while
  delegated callers receive the active child subject and can distinguish it
  from the guardian actor.
- Positive: Existing v1.0.20 structural context mocks remain assignable without
  adding principal properties.
- Positive: Malformed identity data cannot silently fall back to a weaker
  interpretation, and raw age data is minimized.
- Positive: Subject choice and relationship freshness remain server-authorized.
- Positive: Ordinary age-shaped content can use a minimized provider signal
  without silently widening financial or reward-provider authorization.
- Positive: Subject-sensitive consumers can distinguish server authority from
  locally synthesized legacy compatibility state.
- Negative: The auth and entity packages must keep their structurally shared
  scalar types aligned until a released shared schema can be consumed directly.
- Negative: Legacy responses cannot provide the original server authentication
  time, so their synthesized self principal records client observation time.

## Alternatives Considered

- Keep `userId` bound to the guardian actor during child delegation: Rejected
  because legacy consumers could read or mutate guardian-owned data while the
  active authorization subject is the child.
- Let clients set a subject or send subject headers: Rejected because browser
  input cannot establish delegated authorization.
- Put guardian roles in the principal: Rejected because it invites permission
  inheritance into the child subject.
- Require the entity schema envelope in `/oauth/me`: Rejected because transport
  identity and persistence schema versioning have different compatibility needs.
