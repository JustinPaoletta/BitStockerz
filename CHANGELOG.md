# Changelog

All notable changes to this repository will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Local MySQL 8 Docker workflow (`scripts/docker-mysql.sh`, `docs/database/Local_MySQL.md`, `apps/api/.env.example`).
- `npm --prefix apps/api run db:deploy` for non-interactive migration apply; Prisma loads `apps/api/.env` automatically.
- Sprint 1.3 jobs infrastructure (`jobs` table, synchronous executor, timeout handling) and market-data ingestion endpoints with hourly scheduler.
- Sprint 1.2 equity daily and crypto daily/hourly candle read APIs with deterministic in-memory seed fallback.
- Sprint 1.1 symbol lookup and search APIs with in-memory seed data and optional MySQL/MariaDB backing via Prisma.
- Manual testing guide for health, auth, symbol, and candle endpoints (`docs/manual-testing/manual_testing.md`).

### Changed

- API development default port is `4000` (override with `PORT`).
- Updated roadmap, README, API inventory, migration plan, and story status docs to reflect Sprint 1.3 completion.

### Documentation

- Standardize the repository around a shared README structure, a manual changelog, and a root `RELEASE.md` guide.
