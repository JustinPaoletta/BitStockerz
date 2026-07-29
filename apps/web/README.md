# BitStockerz Web

Sprint 3.4's thin Angular SPA provides the dev authentication flow and
backtest list, run, and result-detail screens. It uses Angular CLI/build
21.2.19, Angular 21.2.x, standalone components, Vitest, and Lightweight Charts
5.2.

The repository pins Node 24.11.1. Angular 22.0.8 requires Node 24.15 or newer,
so Angular 21 is the newest supported line compatible with the repository pin.

## Development server

Start the API on port 4000, then from the repository root run:

```bash
npm run web:start
```

Open `http://localhost:4200/`. `proxy.conf.json` forwards relative `/api`
requests to `http://localhost:4000`, avoiding a development CORS exception.
The login screen intentionally exposes the existing development email
login/register shortcuts; production authentication hardening remains owned by
Sprint 5.1.

## Quality gates

```bash
npm run web:build
npm run web:lint
npm run web:test
npm --prefix apps/web audit
```

The client contract fixture used by the mapper test is
`docs/manual-testing/fixtures/backtest-detail.example.json`. The complete human
test sequence is in `docs/manual-testing/PRE_MERGE_CHECKLIST.md`.
