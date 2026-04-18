# BitStockerz

A private BitStockerz monorepo that combines product and database documentation with an early NestJS API implementation.

## Status

- Type: private product monorepo
- Current repo version: `0.0.0`
- Maturity: pre-1.0 documentation and API foundation
- Current runnable surface: `apps/api`
- Release model: manual changelog + release branch flow documented in [RELEASE.md](./RELEASE.md)

## Quick Links

- Changelog: [CHANGELOG.md](./CHANGELOG.md)
- Release process: [RELEASE.md](./RELEASE.md)
- Product roadmap: [docs/product/ROADMAP.md](./docs/product/ROADMAP.md)
- MVP definition: [docs/product/MVP.md](./docs/product/MVP.md)
- UX flows: [docs/product/UX_Flows.md](./docs/product/UX_Flows.md)
- API inventory: [docs/database/API_Inventory.md](./docs/database/API_Inventory.md)
- Database schema: [docs/database/schema.prisma](./docs/database/schema.prisma)

## What The Project Covers

- Product definition and implementation planning for the BitStockerz platform.
- Database design, migration planning, lifecycle policy, and API inventory work.
- Manual testing notes and execution guidance for in-progress stories.
- A NestJS API foundation under `apps/api`, including auth and WebAuthn work.

## Tech Stack

- Root tooling: npm, Husky, and commitlint
- API app: NestJS 11, TypeScript, Jest, Pino, and WebAuthn foundations
- Database planning: Prisma schema plus SQL documentation and migration notes

## Repository Layout

- `apps/api` NestJS API implementation
- `docs/product` product roadmap, MVP, UX flows, and stories
- `docs/database` schema, migration, lifecycle, and API design docs
- `docs/manual-testing` release-adjacent manual validation notes
- root `package.json` repo tooling and release version anchor

## Prerequisites

- Node.js `24.11.1` for `apps/api`
- npm

## Local Setup

1. Install root dependencies with `npm install`.
2. Install API dependencies with `npm --prefix apps/api install`.
3. Start the API locally with `npm --prefix apps/api run start:dev`.
4. Use the `docs/` tree as the source of truth for roadmap, product, and data-model context while you work.

## Common Commands

- `npm run prepare` installs Husky hooks for the repo.
- `npm --prefix apps/api run build` builds the NestJS API.
- `npm --prefix apps/api run lint` runs the API lint checks.
- `npm --prefix apps/api run test` runs the API unit test suite.
- `npm --prefix apps/api run test:e2e` runs the API end-to-end suite.

## Environment & Configuration

- The root repo does not have a shared environment-variable contract yet.
- API-specific runtime configuration is still evolving and should be documented alongside new backend work.
- Database, product, and observability expectations are documented under `docs/`.

## Testing & Quality Gates

- API-focused releases should run `build`, `lint`, `test`, and `test:e2e` from `apps/api`.
- Documentation-heavy releases should verify consistency across the roadmap, MVP, API inventory, and schema documents.
- Manual test evidence belongs under `docs/manual-testing/` when a milestone needs explicit validation notes.

## Release Process

- Keep the root `CHANGELOG.md` updated under `## [Unreleased]`.
- Cut release branches as `release/vX.Y.Z` from `main`.
- Use repo-level tags and release notes even when a release only affects `apps/api`; note the scope clearly in the changelog entry.
- Follow the full checklist in [RELEASE.md](./RELEASE.md).

## Additional Docs

- [docs/product/MVP.md](./docs/product/MVP.md)
- [docs/product/ROADMAP.md](./docs/product/ROADMAP.md)
- [docs/product/UX_Flows.md](./docs/product/UX_Flows.md)
- [docs/database/API_Inventory.md](./docs/database/API_Inventory.md)
- [docs/database/schema.prisma](./docs/database/schema.prisma)
- [docs/manual-testing/manual_testing.md](./docs/manual-testing/manual_testing.md)

## License & Access

UNLICENSED and proprietary.
