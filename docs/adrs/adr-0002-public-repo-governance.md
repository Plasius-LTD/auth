# ADR-0002: Public Package Governance Baseline

- Status: Accepted
- Date: 2026-02-12

## Context

`@plasius/auth` is a public package and must meet the same baseline used by `@plasius/schema` so release quality, trust signals, and operational controls are consistent across the ecosystem.

## Decision

Adopt the schema baseline as a minimum standard:

- README includes npm, build, code coverage, license, code of conduct, security policy, and changelog banners.
- Architecture decisions are documented under `docs/adrs`, including an ADR template for follow-on decisions.
- Legal and security docs are present and kept in sync with release changes.
- CI/CD pipelines run tests with coverage and publish via GitHub workflow, not local ad-hoc release steps.

## Consequences

- Positive: Consumers get consistent package quality and documentation across repos.
- Positive: Release and audit expectations are explicit and repeatable.
- Negative: Maintainers take on additional documentation and governance maintenance work.

## Alternatives Considered

- Repo-specific standards: Rejected because package quality would vary and increase integration risk.
- Minimal docs only: Rejected because public package governance requires stronger baseline evidence.
