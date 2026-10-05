# BitStockerz Web

The Angular SPA includes authentication, dashboard, strategy research, backtests, markets, paper trading, and account settings.
[Product extensions](../../docs/product/PRODUCT_EXTENSIONS.md) describe the October 4 local additions and their limits.

Use Node `24.21.0` from the root `.nvmrc`.
The stack uses Angular `22.2.1`, TypeScript `6.0.3`, standalone components, Vitest, Playwright, and Lightweight Charts `5.2`.
Existing components retain their prior Eager change-detection behavior after the Angular migration.

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
requests to `http://localhost:4000`. Passkeys are the primary login path.
The **Email fallback** panel is shown only in non-production builds; it is
for unsupported browsers and local automation when `AUTH_DEV_EMAIL_ENABLED=true`
on the API.

## Quality gates

```bash
npm run web:build
npm run web:lint
npm run web:test
npm --prefix apps/web run e2e
npm --prefix apps/web audit
```

Unit tests use Vitest with file isolation so third-party module mocks cannot
reuse a real module loaded by another spec. Playwright tests (`e2e/milestone-5-workflows.spec.ts` and `e2e/product-extensions.spec.ts`)
starts the API in seed mode and the web app when they are not already running.
Manual UI walkthrough: `docs/manual-testing/manual_testing.md` Section 13.
The client contract fixture used by the backtest mapper test is
`docs/manual-testing/fixtures/backtest-detail.example.json`.

## Local build-cache failure

If the native LMDB cache crashes, use `NG_BUILD_CACHE_STORE=sqlite` and `NG_BUILD_MAX_WORKERS=1`.
The October 4 local builds and tests used these settings.
This workaround does not establish a general platform requirement.
