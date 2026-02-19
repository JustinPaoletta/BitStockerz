# BitStockerz Knowledge Base

**Proprietary — portfolio use only.** See [LICENSE](LICENSE). All rights reserved.

All documentation now lives under `docs/` with consistent, predictable paths.

## Directory Overview
- `docs/product` – product definition and planning artifacts such as the MVP outline, UX flows, roadmap, and story packs.
  - `docs/product/stories` – individual story maps for each MVP epic.
- `docs/requirements` – cross-cutting qualities: NFRs, security, observability, and testing strategy.
- `docs/database` – schema assets, including Prisma schema, DDL, ERDs, lifecycle policies, and migration plans.
  - `docs/database/DDL` – canonical SQL per domain (referenced by `docs/database/Migrations_Plan.md`).
  - `docs/database/ERD` – visual/text ERDs that link to `../Data_Lifecycle_and_Deletion_Policy.md`.
- `docs/assets/images` – logos, advertisement mocks, and other reference imagery.

Each document now references other files by their relative paths (for example, the migration plan links to `../product/ROADMAP.md`). Use this README as the entry point when navigating the repository.

## AI Navigation Map

Use this section as a fast lookup table for automated agents. Paths are relative to the repo root.

- `docs/product/MVP.md` – master feature list.
- `docs/product/UX_Flows.md` – strategy/backtest, trading, empty/error flows.
- `docs/product/ROADMAP.md` – sprint-by-sprint schedule.
- `docs/product/stories/BitStockerz_MVP_0x_*.md` – story packs per epic (01–08).
- `docs/requirements/` – contains `Non_Functional_Requirements.md`, `Security.md`, `Observability.md`, `Testing_Strategy.md`.
- `docs/database/schema.prisma` – Prisma ORM schema reference.
- `docs/database/Migrations_Plan.md` – sprint-to-DDL mapping; SQL lives under `docs/database/DDL/` (`00_core.sql` … `06_infra.sql`).
- `docs/database/Data_Lifecycle_and_Deletion_Policy.md` – retention + deletion guarantees referenced by ERDs.
- `docs/database/API_Inventory.md` – NestJS endpoint catalog.
- `docs/database/ERD/BitStockerz_ERD.md` and `docs/database/ERD/BitStockerz_dbdiagram_ERD.md` – structural reference diagrams.
- `docs/assets/images/` – `logo.png`, `advertisement.png`, `kernel.png`.

### Lookup Tips
- When a document references another file, expect the relative paths listed above (e.g., migrations link to `../product/ROADMAP.md`).
- Database DDL filenames use numeric prefixes; match them when creating migrations.
- Story IDs mirror the numbering in the roadmap and story files.

### Usage Pattern for Agents
1. Read this README for the human overview.
2. Use the AI Navigation Map bullets to jump directly to the needed artifact.
3. Only fall back to filesystem scans if the desired item is not listed here.
