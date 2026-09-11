# BitStockerz deployment runbook (MVP Option A)

**Decision (JC-1):** Always-on Nest API + in-process `JobSchedulerService` on
**Fly.io** (single region), **Vercel** static Angular SPA, colocated managed
MySQL for the API. Option B (Nest on Vercel + Cron) remains documented in
`docs/plans/sprint-7-2-deployment-hosting.md` but is not the default.

## Topology

| Tier | Platform | Notes |
|------|----------|-------|
| Web | Vercel | Static `apps/web/dist/web/browser`; SPA rewrite in `apps/web/vercel.json` |
| API + jobs | Fly.io | `apps/api/Dockerfile` + `apps/api/fly.toml`; **one replica** while in-process cron is enabled |
| DB | Managed MySQL | Same region as API (`iad` default); Prisma migrate compatible |

## Required secrets

Store in GitHub Environment `production` and/or host dashboards. **Never commit.**

| Secret | Used by |
|--------|---------|
| `DATABASE_URL` | migrate + API |
| `FLY_API_TOKEN` | API deploy |
| `API_BASE_URL` | post-deploy smoke + web `apiBaseUrl` injection |
| `VERCEL_TOKEN` | web deploy |
| `VERCEL_ORG_ID` | web deploy |
| `VERCEL_PROJECT_ID` | web deploy |

API host env (Fly secrets): `CORS_ALLOWED_ORIGINS`, `WEBAUTHN_RP_ID`,
`WEBAUTHN_ALLOWED_ORIGINS`, `JOBS_SYSTEM_USER_ID`,
`INGESTION_SCHEDULER_ENABLED=true`, `AI_ENABLED=false` until approved,
auth/OAuth credentials when enabled.

## Release sequence

1. CI green on `main` (build/lint/unit/coverage/e2e + web build).
2. Serialized production concurrency group.
3. `prisma migrate status` → `prisma migrate deploy` **once**.
4. Deploy API; wait for `/api/health/live` and `/api/health/ready`.
5. Build web with `environment.prod.ts` `apiBaseUrl` set to the verified API.
6. Deploy web to Vercel production.

## Smoke checklist

- [ ] `GET /api/health/live` → ok
- [ ] `GET /api/health/ready` → ready with DB up (503 if DB missing in production)
- [ ] Auth session (passkey or email fallback)
- [ ] Symbols search
- [ ] Paper account portfolio read
- [ ] SPA deep-link refresh (`/strategies/...`)
- [ ] CORS preflight from the Vercel origin
- [ ] AI remains disabled (`AI_ENABLED=false`) until approved
- [ ] Exactly one scheduled import job/audit event (single API replica)

## Rollback

1. Fly: `fly releases` / `fly deploy --image <previous>` or redeploy prior git SHA.
2. Vercel: promote previous production deployment.
3. DB: restore from provider snapshot/backup before re-running a destructive migration.
   Prefer expand/contract migrations so the prior API revision stays safe.

## Ops knobs

| Action | How |
|--------|-----|
| Disable scheduler | Set `INGESTION_SCHEDULER_ENABLED=false` and restart API |
| Rotate secrets | Update Fly/Vercel/GitHub secrets; redeploy API |
| Incident health | `/api/health/*`, `/api/market-data/health`, `/api/metrics` |

## External provisioning still required

Creating the Fly app, managed MySQL, Vercel project, and GitHub Environment
secrets is an operator step. Repo artifacts are ready; first production URL
appears only after those accounts exist.
