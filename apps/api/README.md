# BitStockerz API

NestJS API for BitStockerz (`apps/api`). Global prefix: `/api`. Default port: **4000**.

## Quick start

```bash
npm install
cp .env.example .env   # optional — omit DATABASE_URL for in-memory seed mode
npm run start:dev
```

MySQL setup: [docs/database/Local_MySQL.md](../../docs/database/Local_MySQL.md)

## Commands

| Command | Purpose |
| --- | --- |
| `npm run start:dev` | Dev server with watch |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test` | Unit tests |
| `npm run test:cov` | Unit tests + **90%** global coverage gates |
| `npm run test:e2e` | E2E suite (forces seed mode via `test/setup-e2e.ts`) |
| `npm run db:deploy` | Apply Prisma migrations |

## Configuration

Copy `.env.example` to `.env` (never commit `.env`). The server loads `.env` on startup via `src/load-env.ts`.

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | MySQL URL. Omit for in-memory seed mode. |
| `PORT` | Listen port (default `4000`). |
| `INGESTION_SCHEDULER_ENABLED` | Hourly background imports. When unset: `true` if `NODE_ENV=development`, otherwise `false`. Always off when `NODE_ENV=test`. Set `false` while manually testing ingestion. |
| `JOB_TIMEOUT_MS` | Job executor timeout (default `30000`). |
| `JOBS_SYSTEM_USER_ID` | User id for scheduled jobs (default `00000000-0000-4000-8000-000000000001`). |
| `MARKET_DATA_HEALTH_URL` | Optional readiness probe for `checks.marketData`. |

## Verification

From repo root:

```bash
./scripts/sprint-delivery-verify.sh verify
KEEP_DATABASE_URL=1 ./scripts/sprint-delivery-verify.sh verify   # smoke + MySQL persistence (loads apps/api/.env)
```

Manual curl tests: [docs/manual-testing/manual_testing.md](../../docs/manual-testing/manual_testing.md)

## Docs

- [API inventory](../../docs/database/API_Inventory.md)
- [Roadmap](../../docs/product/ROADMAP.md)
- [Root README](../../README.md)
