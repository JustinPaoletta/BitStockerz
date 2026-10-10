# BitStockerz iOS research prototype

Updated October 10, 2026.

The app bundles the Angular interface in Capacitor 8.5.3. It has a native
AuthenticationServices passkey bridge, a price chart, a guided strategy/backtest
flow, saved results/history, and an iOS share sheet for CSV/JSON exports.
The prototype targets iOS 16 or later and requires Xcode 26 or later.

## Start on this Mac

From the repository root, use Node 24.21.0 (`nvm use`). Dependencies are already
installed on the development Mac. For a fresh checkout, run `npm ci`,
`npm --prefix apps/api ci`, and `npm --prefix apps/web ci` first.

```sh
npm run ios:prepare
npm run ios:sync
npm run ios:api
```

Leave the API terminal running. In a second terminal:

```sh
npm run ios:open
```

In Xcode, choose the **App** scheme, an iPhone simulator, and **Run**.
The project is `apps/web/ios/App/App.xcodeproj`; Swift Package Manager resolves
Capacitor automatically. Do not look for a CocoaPods workspace.

Simulator mode points to `http://localhost:4310`. On the sign-in screen, enter a
throwaway test email, expand **Email fallback**, and choose **Email register**.
This is a development login, not a passkey test. Native passkeys deliberately
reject the unconfigured domain. No fake passkey response is accepted.

Choose **Open chart**, then return to **Research** and choose **Set up a backtest**.
Select a range within the last year, review the capital and cost assumptions, and
choose **Run backtest**. Inspect the equity curve, benchmark, metrics, and trades.
Open **Backtests** to find the saved run. The export buttons open the iOS share sheet.

The local API binds to `127.0.0.1`, ignores `.env` files and inherited provider
credentials, uses in-memory storage, and serves synthetic sample prices. It does
not use Aiven, Fly, licensed data, real trades, or the production database.
Stopping it discards prototype accounts, strategies, and runs. Do not expose
simulator mode through a tunnel: its email fallback is intentionally local only.

## What you need for your iPhone

You already have an Apple Developer account. A valid Apple Development signing
identity was found on this Mac. The remaining inputs are a stable HTTPS passkey
domain and an HTTPS endpoint for a dedicated prototype API.

You do not necessarily need to buy a domain. A hosting subdomain you control can
work if it serves Apple's association file at the exact root path below, with no
login requirement or redirect. The existing protected Vercel beta must keep its
access protection; use a separate public association-file host if needed.
A rotating temporary tunnel hostname is unsuitable for a persistent passkey RP.

1. Select the **RP domain**, such as `research.your-domain.example`, and an
   **API origin**, such as `https://api.your-domain.example`. These can be the same
   host when its reverse proxy serves both `/api` and `/.well-known` correctly.
2. Configure device mode. Replace both example hosts and the Team ID:

   ```sh
   npm run ios:prepare -- --mode device \
     --api-origin https://api.your-domain.example \
     --rp-id research.your-domain.example \
     --team-id YOURTEAMID
   ```

   `--bundle-id com.bitstockerz.research` is optional. If you choose a different
   bundle identifier, regenerate the association file with that same identifier.
   Find the ten-character **Team ID** in Apple Developer membership details.
3. Publish the generated `artifacts/ios-setup/apple-app-site-association` at:

   ```text
   https://research.your-domain.example/.well-known/apple-app-site-association
   ```

   It must return HTTP 200, `Content-Type: application/json`, without a redirect,
   cookie, authentication challenge, or file extension. The generated
   `webcredentials.apps` entry is `TEAM_ID.BUNDLE_ID`.
4. Stop any previous prototype API before changing modes. Start `npm run ios:api` **after selecting device mode**, then forward only your
   dedicated prototype HTTPS API origin to `127.0.0.1:4310` using your chosen
   authenticated hosting/tunnel account. Keep that terminal running. This mode
   disables both email login and legacy WebAuthn bypasses. It expects real
   passkey assertions for `https://RP_DOMAIN`, while CORS allows the separate
   `capacitor://localhost` origin. Use only disposable research data on this
   temporary API. This is not the protected production deployment.
5. Run `npm run ios:check-domain`. It verifies the public association file, API
   readiness, authentication-route access, and native CORS preflight. Passing these checks does not prove that
   Apple has fetched the association or that native authentication succeeds.
6. Run `npm run ios:sync` and `npm run ios:open`. In Xcode select **App → Signing &
   Capabilities**, your developer team, and **Automatically manage signing**.
   The project already includes the **Associated Domains** entitlement with
   `webcredentials:RP_DOMAIN`. Confirm the RP domain and bundle identifier match
   the values you configured. Let Xcode register/provision that app identifier.
7. Connect and unlock your iPhone, trust the Mac, and enable **Settings → Privacy
   & Security → Developer Mode** if prompted. Select the iPhone as Xcode's run
   destination and press **Run**. Complete any Apple account, device trust, or
   keychain prompts yourself.
8. Enable iCloud Passwords & Keychain and a device passcode. In the app choose
   **Register**, enter a test email, then **Create with passkey**. Approve the
   system Face ID/Touch ID prompt. Log out, then sign in with the same email.

Do not place `PRIVATE_BETA_PROXY_KEY`, database credentials, or any hosting token
in the app. The current protected Fly/Vercel production route expects a server
proxy key and is not a drop-in mobile endpoint. Moving this prototype onto
production requires a deliberate mobile API access design; this work does not
remove the existing production access guard.

## iPhone acceptance checklist

- [ ] Create a passkey; log out and sign in with the same account using Face ID.
- [ ] Cancel the system prompt. Confirm the app shows an error and allows retry.
- [ ] Verify a failed or mismatched challenge does not create an authenticated session.
- [ ] Force-quit and reopen. Sign in again; the native bearer is memory-only.
- [ ] Open the chart; pan/zoom, rotate the phone, and inspect the OHLCV table.
- [ ] Create the starter strategy, change dates/cost assumptions, run a backtest,
      and inspect its equity curve, metrics, benchmark, and individual trades.
- [ ] Open the completed run from history; confirm its original settings/results.
- [ ] Export results and trades; save each CSV to Files and open it.
- [ ] Turn off connectivity and try loading a chart/backtest. Check the error,
      restore connectivity, and retry. The prototype requires a reachable API.
- [ ] Check the keyboard, text size, VoiceOver labels, and landscape layout on
      your actual iPhone. Automated phone-width checks do not cover these fully.

## Verification and limits

- All 984 API tests and 106 web unit tests passed locally, along with web lint,
  API build, configuration checks, and three browser integration tests covering
  phone-width WebAuthn/chart/backtest/history/export and passkey recovery.
- Simulator and unsigned physical-iPhone Debug builds both compiled successfully.
  The simulator app launched on iOS 26.5.
  Native local email registration and the authenticated research screens loaded
  successfully against the isolated API.
- Actual-device signing/install, Apple's association lookup, Face ID, native
  sharing, and physical-device accessibility remain separate acceptance gates.
- No production deployment, domain purchase, paid resource, or provider account
  was created by this prototype work. Production deployment remains disabled.
- Passkeys are handled by the system credential provider. Native bearer tokens
  are not persisted to browser storage; relaunch requires sign-in.
- The prototype uses existing research screens. It is not an offline app,
  TestFlight release, or App Store submission; native OAuth is not enabled.
- The generated `Prototype.xcconfig`, native environment file, web bundle,
  setup files, and local endpoint settings are ignored by Git.

Useful checks:

```sh
npm run ios:test:config
npm --prefix apps/web test -- --watch=false
npm --prefix apps/web run lint
npm --prefix apps/web run e2e -- e2e/ios-research.spec.ts
xcodebuild -project apps/web/ios/App/App.xcodeproj -scheme App \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath apps/web/ios/DerivedData CODE_SIGNING_ALLOWED=NO build
```

Reference: [Capacitor iOS setup](https://capacitorjs.com/docs/ios) and
[Apple's passkey integration](https://developer.apple.com/documentation/authenticationservices/supporting-passkeys).
