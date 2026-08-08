# BitStockerz Web

Milestone 5 Angular SPA: passkey-first auth (email fallback), dark branded
shell, dashboard widgets, Strategy Lab, backtest workflows, and paper Trade
desk. Stack: Angular CLI/build 21.2.19, Angular 21.2.x, standalone components,
Vitest, Playwright, `@simplewebauthn/browser`, and Lightweight Charts 5.2.

The repository pins Node 24.11.1. Angular 22.0.8 requires Node 24.15 or newer,
so Angular 21 is the newest supported line compatible with the repository pin.

## Development server

Start the API on port 4000 (seed mode example):

```bash
DATABASE_URL= INGESTION_SCHEDULER_ENABLED=false \
  WEBAUTHN_ALLOWED_ORIGINS=http://localhost:4200 \
  npm --prefix apps/api run start:dev
```

Then from the repository root:

```bash
npm run web:start
```

Open `http://localhost:4200/`. `proxy.conf.json` forwards relative `/api`
requests to `http://localhost:4000`. Passkeys are the primary login path;
email register/login under **Email fallback** is for unsupported browsers and
local automation.

## Quality gates

```bash
npm run web:build
npm run web:lint
npm run web:test
npm --prefix apps/web run e2e
npm --prefix apps/web audit
```

Unit tests use Vitest. Playwright e2e (`e2e/milestone-5-workflows.spec.ts`)
starts the API in seed mode and the web app when they are not already running.
Manual UI walkthrough: `docs/manual-testing/manual_testing.md` Section 13.
The client contract fixture used by the backtest mapper test is
`docs/manual-testing/fixtures/backtest-detail.example.json`.
