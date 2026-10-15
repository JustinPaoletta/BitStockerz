# BitStockerz Web

The Angular SPA includes authentication, dashboard, strategy research, backtests, markets, paper trading, and account settings.
[Product extensions](../../docs/product/PRODUCT_EXTENSIONS.md) describe the additions merged in PR #15 and their limits.

Use Node `24.21.0` from the root `.nvmrc`.
The stack uses Angular `22.2.1`, TypeScript `6.0.3`, standalone components, Vitest, Playwright, and Lightweight Charts `5.2`.
Existing components retain their prior Eager change-detection behavior after the Angular migration.

For Capacitor commands and device setup, use the [iOS guide](../../IOS_PROTOTYPE.md).
Native sessions stay in memory; browser sessions use `sessionStorage`. Native Google/Apple OAuth is not enabled.

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

Unit tests use Vitest with file isolation so third-party module mocks cannot reuse a real module loaded by another spec.
Playwright starts seed-mode API and web servers when compatible servers are not already running locally.
CI always starts its own servers.

Tests include the main workflows, product extensions, and `e2e/ios-research.spec.ts`.
The iOS research test uses Chromium at phone width with a virtual WebAuthn authenticator.
It does not test the native AuthenticationServices bridge or iOS share sheet.
Use [Manual testing, Section 13](../../docs/manual-testing/manual_testing.md#section-13--angular-milestone-5-sprints-5153) for browser acceptance.
The backtest mapper uses [this contract fixture](../../docs/manual-testing/fixtures/backtest-detail.example.json).

## Local build-cache failure

If the native LMDB cache crashes, use `NG_BUILD_CACHE_STORE=sqlite` and `NG_BUILD_MAX_WORKERS=1`.
The October 4 local builds and tests used these settings.
This workaround does not establish a general platform requirement.
