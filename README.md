# BitStockerz

BitStockerz is a private strategy-research product with a NestJS API and an Angular application.
Users build strategies, run historical backtests, compare results, and simulate trades in a paper account.

## Delivery status

The repository version is `0.0.0`; the product is prelaunch.
Milestones 0–7 merged through [PR #12](https://github.com/JustinPaoletta/BitStockerz/pull/12).
Browser OAuth, profile recovery, paper P&L, and chart markers merged in
[PR #13](https://github.com/JustinPaoletta/BitStockerz/pull/13) on October 2, 2026.

The [product extensions](docs/product/PRODUCT_EXTENSIONS.md) merged in
[PR #15](https://github.com/JustinPaoletta/BitStockerz/pull/15) on October 5, 2026 (EDT).
[Main CI](https://github.com/JustinPaoletta/BitStockerz/actions/runs/37410465260)
passed all migrations, five MySQL persistence gates, and the production-image build.
The subsequent deployment failed because `DATABASE_URL` was empty.
Hosting, real providers, and production acceptance remain outstanding.

Use [PRODUCT_TASKLIST.md](PRODUCT_TASKLIST.md) for unfinished work.
Use the [deployment runbook](docs/ops/deployment.md) for account setup and launch procedures.

## Local setup

Use Node.js `24.21.0`, pinned in `.nvmrc` and CI.
With nvm, run `nvm install` and then `nvm use`.
From the repository root, install the locked dependencies:

```sh
npm ci
npm --prefix apps/api ci
npm --prefix apps/web ci
```

For persistent development data, follow [Local MySQL](docs/database/Local_MySQL.md).
For a disposable session with synthetic prices, start the API in seed mode:

```sh
DATABASE_URL= INGESTION_SCHEDULER_ENABLED=false npm --prefix apps/api run start:dev
```

In another terminal, start Angular:

```sh
npm run web:start
```

Open `http://localhost:4200`.
The development proxy forwards `/api` to `http://localhost:4000`.
Seed-mode users, results, and paper trades disappear when the API stops.

## Guides

| Topic                                              | Maintained guide                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| API commands, configuration, and generated OpenAPI | [API README](apps/api/README.md)                                                            |
| Angular development and browser tests              | [Web README](apps/web/README.md)                                                            |
| Contributor rules and implementation contracts     | [Documentation index](docs/plans/README.md)                                                 |
| Product scope and delivery history                 | [MVP](docs/product/MVP.md), [roadmap](docs/product/ROADMAP.md)                              |
| Current research and account behavior              | [Product extensions](docs/product/PRODUCT_EXTENSIONS.md)                                    |
| HTTP contracts and design targets                  | [API inventory](docs/database/API_Inventory.md)                                             |
| Database setup and migration history               | [Local MySQL](docs/database/Local_MySQL.md), [migrations](docs/database/Migrations_Plan.md) |
| Active-data deletion and external retention        | [Data lifecycle](docs/database/Data_Lifecycle_and_Deletion_Policy.md)                       |
| Automated gates and dated evidence                 | [Testing strategy](docs/product/requirements/Testing_Strategy.md)                           |
| Manual API and browser procedures                  | [Manual testing](docs/manual-testing/manual_testing.md)                                     |
| Hosting, provider setup, backups, and alerts       | [Deployment](docs/ops/deployment.md)                                                        |
| Dated prelaunch security findings                  | [Security review](docs/ops/security-review.md)                                              |
| Release procedure and history                      | [RELEASE.md](RELEASE.md), [CHANGELOG.md](CHANGELOG.md)                                      |

The runtime database authority is [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma)
and its [migration directory](apps/api/prisma/migrations).
SQL, Prisma, and ERD files under `docs/database` preserve the original design targets.
They are not deployment inputs.

## Repository layout

- `apps/api`: NestJS 11 API, Prisma persistence, jobs, and operator import tools.
- `apps/web`: Angular 22.2.1 SPA, TypeScript 6.0.3, Vitest, and Playwright.
- `docs/product`: scope, contracts, requirements, and original story acceptance criteria.
- `docs/database`: API inventory, migration guide, lifecycle policy, and conceptual schemas.
- `docs/ops`: deployment procedures and dated security evidence.
- `scripts`: local MySQL, HTTP smoke, verification, and production health tools.

## License and access

The repository is proprietary and `UNLICENSED`.
