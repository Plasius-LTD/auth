# ADR-0001: Auth Package Scope and API Surface

- Status: Accepted
- Date: 2026-02-12

## Context

Plasius applications need a shared authentication package that can be used by frontend applications and supporting services without re-implementing auth flows in each repo.

## Decision

Define `@plasius/auth` as the single package for authentication primitives, with these boundaries:

- Export provider, hooks, and utility APIs needed by consuming apps.
- Keep transport and backend specifics behind clear interfaces instead of hard-coding app-specific behavior.
- Publish dual ESM and CJS builds with TypeScript declarations for broad compatibility.
- Keep package documentation and demos in-repo to reduce integration drift.

## Consequences

- Positive: Consistent auth integration and lower duplication across projects.
- Positive: Consumer apps can upgrade auth behavior through package versioning.
- Negative: Requires strict semver discipline to avoid breaking login/session flows.

## Alternatives Considered

- Per-app auth implementations: Rejected due to duplicated logic and inconsistent behavior.
- Monolithic app-owned auth module: Rejected because it prevents reuse across packages and repos.
