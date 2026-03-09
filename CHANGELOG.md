# Changelog

All notable changes to this project will be documented in this file.

The format is based on **[Keep a Changelog](https://keepachangelog.com/en/1.1.0/)**, and this project adheres to **[Semantic Versioning](https://semver.org/spec/v2.0.0.html)**.

## [Unreleased]

- **Added**
  - Added regression coverage to verify refresh-token requests carry the CSRF header during automatic session renewal.

- **Changed**
  - (placeholder)

- **Fixed**
  - Reused the standard authenticated fetch path for `/oauth/refresh-token` so automatic session refresh includes the CSRF header and credentials consistently.

- **Security**
  - (placeholder)

## [1.0.9] - 2026-03-04

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.5] - 2026-03-01

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.4] - 2026-02-28

- **Added**
  - (placeholder)

- **Changed**
  - (placeholder)

- **Fixed**
  - (placeholder)

- **Security**
  - (placeholder)

## [1.0.3] - 2026-02-28

### Changed

- Rewrote `README.md` with complete API reference, endpoint expectations, and development workflow details.
- Normalized changelog history by removing duplicate sections and replacing placeholder-only release notes with concrete entries.
- Expanded README with a detailed server integration contract: required auth endpoints, request/response behavior, CSRF/cookie expectations, and cross-origin deployment notes.
- Added an OAuth 2.0 standards-alignment section in README with direct RFC links and a backend compliance checklist.
- Hardened `createAuthorizedFetch()` to prevent auth-endpoint retry storms by limiting refresh retry loops and introducing cooldown logic after refresh failure or repeated `401`.
- Added randomized logarithmic backoff for refresh outage responses (`429`/`5xx`) so repeated failures progressively reduce auth-endpoint request pressure.

## [1.0.2] - 2026-02-22

### Changed

- Updated internal dependency `@plasius/entity-manager` from `^1.0.4` to `^1.0.5`.

## [1.0.1] - 2026-02-22

### Changed

- Upgraded core dev tooling (`vitest`, `@vitest/coverage-v8`, `eslint`, and `@typescript-eslint/*`) and refreshed lockfile state.
- Hardened CI coverage and Codecov handling across workflow edge cases.
- Added governance and package baseline docs (`docs/adrs/*`, `CONTRIBUTING.md`, `legal/*`) and a demo scaffold.

### Security

- Added a dependency override for `minimatch` (`^10.2.1`) to address transitive audit findings.

## [1.0.0] - 2026-02-10

### Added

- Initial standalone public release of `@plasius/auth`.
- React auth context provider and auth helpers (`useLogin`, `useLogout`, `useAuthorizedFetch`).
- Dual ESM/CJS bundles with TypeScript declarations.
- CI/CD workflows for testing, coverage, and npm publishing.

## Release Process (Maintainers)

1. Update `CHANGELOG.md` under **Unreleased** with user-visible changes.
2. Bump version in `package.json` following SemVer (major/minor/patch).
3. Move entries from **Unreleased** to a new version section with the current date.
4. Tag the release in Git (`vX.Y.Z`) and push tags.
5. Publish to npm via GitHub CD workflow.

> Tip: Use Conventional Commits in PR titles/bodies to make changelog updates easier.

[Unreleased]: https://github.com/Plasius-LTD/auth/compare/v1.0.9...HEAD
[1.0.2]: https://github.com/Plasius-LTD/auth/compare/858d03c...fdf8d70
[1.0.1]: https://github.com/Plasius-LTD/auth/compare/v1.0.0...858d03c
[1.0.0]: https://github.com/Plasius-LTD/auth/releases/tag/v1.0.0
[1.0.3]: https://github.com/Plasius-LTD/auth/releases/tag/v1.0.3
[1.0.4]: https://github.com/Plasius-LTD/auth/releases/tag/v1.0.4
[1.0.5]: https://github.com/Plasius-LTD/auth/releases/tag/v1.0.5
[1.0.9]: https://github.com/Plasius-LTD/auth/releases/tag/v1.0.9
