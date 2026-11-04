# BitStockerz iOS research prototype

Updated November 4, 2026. iPhone is the initial launch platform.
This guide covers prototype/demo commands and implemented staging/production build configuration.
Release configuration and default-off mobile admission are implemented. Hosted acceptance and app distribution remain open.
The [app delivery plan](APP_ONLY_PLAN.md) defines those remaining gates.

Native passkeys still require an associated HTTPS domain. Demo mode cannot authenticate production users.

## Staging and production build configuration — November 3, 2026

Stage A configuration and artifact gates are implemented. Stage B admission is implemented behind a disabled flag.
Hosting, native authentication, and signed distribution require separate acceptance.

The supported modes are `simulator`, `device`, `device-demo`, `staging`, and `production`.
Staging uses `com.bitstockerz.research.staging`; production uses `com.bitstockerz.research`.
Both Xcode configurations target iPhone only. iPad layouts are outside the initial release scope.

Both release channels require a stable HTTPS API, stable RP domain, Team ID, three-part version, and numeric build number.
The build number accepts integers from 1 to 9999. Increase it for each distributed build; store-history enforcement is not implemented.
The existing simulator/device/demo modes remain local research tools and must use Xcode Debug builds.

Set `BITSTOCKERZ_API_ORIGIN`, `BITSTOCKERZ_RP_DOMAIN`, and `BITSTOCKERZ_APPLE_TEAM` to your approved public values before running:

```sh
npm run ios:prepare -- --mode staging \
  --api-origin "$BITSTOCKERZ_API_ORIGIN" \
  --rp-id "$BITSTOCKERZ_RP_DOMAIN" \
  --team-id "$BITSTOCKERZ_APPLE_TEAM" \
  --version 0.1.0 --build-number 1
npm run ios:sync:release
npm run ios:check:release
```

Use `--mode production` only from committed source. Commit or stash intended changes before preparing production; never discard unrelated work.
Run preparation again after changing the source revision or public build configuration.
The sync command rejects edited generated environments, builds Angular, verifies its identity, synchronizes Capacitor, and verifies the native assets.
It uses SQLite for Angular's cache. It does not start the synthetic API, deploy services, sign, or upload an app.

After Xcode builds the app, inspect the actual artifact:

```sh
npm run ios:check:release -- --app /absolute/path/to/App.app
```

The inspection checks the compiled JavaScript fingerprint, public manifest, Capacitor routing, plist identity, version, build, RP, and source revision.
The Xcode Release phase rejects demo channels, stale native settings, and dirty production source.
It requires the `App/App.entitlements` build setting. It does not inspect a code signature or the signed entitlement payload.
Inspect signing, provisioning, and associated-domain entitlements during signed-device acceptance.

Debug builds retain the disposable demo workflow. Staging/production startup rejects settings that would activate test login or mismatch the prepared API.

Public configuration and asset hashes are recorded under ignored `artifacts/ios-build/` directories.
The fingerprint identifies public configuration and source revision. Dirty staging source is disclosed and is not a reproducible clean release.
Generated files remain ignored, including `apps/web/public/ios-build.local.json`.

Validation on November 3 used fixture HTTPS names without contacting those hosts.
The staging Release simulator build passed, its built artifact passed inspection, and the app installed and launched in the simulator.
These results do not establish a working backend, domain ownership, native passkeys, signing, or physical-device installation.

The physical iPhone remained unavailable during this work.

### Persistent mobile enrollment and host checks

The persistent API supports invitation-based passkey enrollment when `PRIVATE_BETA_MOBILE_ENABLED=true`.
The flag defaults to `false`. Do not enable it before the hosted staging gates pass.
Use the [mobile beta operations guide](docs/ops/mobile-beta.md) for invitations, revocation, and activation prerequisites.
The native registration form collects the invitation code. Returning passkey login does not need that code.

Existing accounts are not automatically admitted; migration or reactivation needs a separate approved procedure.

`npm run ios:check-domain` checks only prototype `device` and `device-demo` configurations.
It rejects staging/production modes and does not validate the persistent mobile admission path.
Use the hosted acceptance checklist in the operations guide for that path.

## Recorded device evidence and remaining acceptance

PR #19 (`59c4963`) recorded signed installation and a synthetic research journey on iPhone 15 Pro.
The final app-name build had `CFBundleDisplayName = BitStockerz`; the home-screen label was not visually checked afterward.
The recorded chart, watchlist, strategy/backtest, no-trades results, and saved-history journey passed using the temporary demo API.
The tunnel and demo API were stopped afterward. This record does not establish current endpoint availability.
Native passkeys, a populated trade table, native export acceptance, and accessibility remain unverified on the device.

Use the checklist below for outstanding acceptance; rerun release-relevant journeys on the persistent app build.

The app bundles the Angular interface in Capacitor 8.5.3.
AuthenticationServices provides native passkey registration and login.
The research flow includes a price chart, strategy setup, backtests, saved results, and history.
CSV/JSON exports use the iOS share sheet.
The target is iOS 16 or later; development requires Xcode 26 or later.

## Start on this Mac

Use Node 24.21.0 from `.nvmrc`. Run all commands from the repository root.
For a new checkout, first install dependencies as described in the [README](README.md#local-setup).

1. Prepare the simulator configuration:

   ```sh
   npm run ios:prepare
   ```

2. Build the web assets and synchronize the iOS project:

   ```sh
   npm run ios:sync
   ```

3. Start the isolated API:

   ```sh
   npm run ios:api
   ```

4. Keep that terminal running. In a second terminal, open Xcode:

   ```sh
   npm run ios:open
   ```

5. Select the **App** scheme.
6. Select an iPhone simulator.
7. Select **Run**.

The project is `apps/web/ios/App/App.xcodeproj`.
Swift Package Manager resolves Capacitor dependencies; there is no CocoaPods workspace.
Simulator mode uses `http://localhost:4310`.

### Simulator login and research

1. Select **Create an account**, then enter a disposable test email and display name.
2. Expand **Development email sign-in**.
3. Select **Create a local test account**.
4. Select **Open chart**.
5. Return to **Research**.
6. Select **Set up a backtest**.
7. Select dates within the last year.
8. Examine the capital and cost assumptions.
9. Select **Run backtest**.
10. Examine the equity curve, benchmark, metrics, and trades.
11. Open **Backtests** to find the saved run.

This email login does not test passkeys.
Native passkeys reject the unconfigured domain; the API does not accept fake passkey responses.
Export buttons open the iOS share sheet, which still requires device acceptance.

### Local data and access

The isolated API binds to `127.0.0.1` and ignores `.env` files and inherited provider credentials.
It uses in-memory storage and synthetic prices.
Stopping the API discards prototype accounts, strategies, and runs.
It does not connect to Aiven, Fly, licensed data, or the production database.

Do not expose simulator mode through a tunnel. Its email fallback is for local use only.

## Personal Team demo on an iPhone

A free Personal Team can run the chart and backtest prototype with a test login.
It cannot provision the Associated Domains capability that native passkeys need.
Use `device-demo` only for synthetic research; it does not verify identity.

1. Start a dedicated temporary HTTPS tunnel to `http://127.0.0.1:4310`.
   With the installed `cloudflared` CLI, pass a separate empty configuration
   so existing tunnels and routes are not inherited:

   ```sh
   printf '{}\n' > /tmp/bitstockerz-demo-tunnel.yml
   cloudflared tunnel --config /tmp/bitstockerz-demo-tunnel.yml --no-autoupdate --url http://127.0.0.1:4310
   ```

   Keep this terminal open. Copy the temporary `https://…trycloudflare.com`
   URL printed by `cloudflared` into the next command.

2. Prepare the app with your temporary origin and signing team:

   ```sh
   npm run ios:prepare -- --mode device-demo --api-origin https://YOUR-TUNNEL.trycloudflare.com --team-id YOURTEAMID
   npm run ios:sync
   ```

3. Run `npm run ios:api` in a separate terminal, then `npm run ios:check-domain`.
   The check verifies CORS, readiness, and the demo access gate; it does not
   require an association domain.
4. Open the project with `npm run ios:open`. Select **App**, your **Personal
   Team**, and your connected iPhone. Select **Run**.
5. Open **BitStockerz**, then **Start test session**. Use **Open chart**
   and **Set up a backtest** from Research.

The demo has a separate bundle identifier ending in `.demo` and no Associated
Domains entitlement. It uses one fictional account. Accounts and runs disappear
when the API restarts. The temporary origin must stay running and reachable;
if it changes, prepare, sync, rebuild, and install again. Personal Team
provisioning also requires rebuilding when its profile expires.

`ios:prepare` generates a disposable demo access key in ignored local files.
The app sends it only on relative API requests to the configured prototype
server. The API rejects requests without it. The key is extractable from a
demo app and is not production authentication. Do not distribute the build or
use real personal data. Production keys and database credentials are never
imported.

Preparing again rotates the demo key: restart the API and rebuild
the app together. Do not publish the generated web bundle. Native passkeys
remain deferred in this mode.

## What you need for your iPhone

An active paid Apple Developer Program membership is required for the
associated-domain setup. A free Apple developer account or Personal Team is
sufficient only for the test-login demo above.
The October 10 inspection found an Apple Development signing identity on this Mac.
Demo installation and signing were recorded in PR #19. Persistent passkey-app signing and authentication still require acceptance.

You must select a stable HTTPS passkey domain and a reachable HTTPS origin for the dedicated prototype API.
The relying party (RP) is the domain associated with the app's passkeys.
The API origin is the HTTPS address without a path, credentials, query, or fragment.

A hosting subdomain you control can serve as the RP domain; buying a domain is not required.
It must serve Apple's association file publicly at the path below, without a redirect or login requirement.
Keep the existing Vercel beta protected. If necessary, use a separate public host for the association file.
A rotating tunnel hostname is unsuitable for a persistent RP.

### 1. Set the device configuration

1. Select an RP domain, such as `research.your-domain.example`.
2. Select an API origin, such as `https://api.your-domain.example`.
3. Find the ten-character **Team ID** in Apple Developer membership details.
4. Replace the example hosts and Team ID in this command:

   ```sh
   npm run ios:prepare -- --mode device \
     --api-origin https://api.your-domain.example \
     --rp-id research.your-domain.example \
     --team-id YOURTEAMID
   ```

The two hosts can be the same if the reverse proxy serves both `/api` and `/.well-known` correctly.
The default bundle identifier is `com.bitstockerz.research`.
To change it, add `--bundle-id` with your chosen identifier.
Regenerate the association file whenever the Team ID or bundle identifier changes.

### 2. Publish the Apple association file

Publish `artifacts/ios-setup/apple-app-site-association` at the selected RP domain:

```text
https://research.your-domain.example/.well-known/apple-app-site-association
```

The response must have HTTP status 200 and `Content-Type: application/json`.
It must not require cookies or authentication, redirect the request, or add a file extension.
The generated `webcredentials.apps` entry is `TEAM_ID.BUNDLE_ID`.

### 3. Connect the prototype API

1. Stop any previous prototype API.
2. After preparing device mode, start `npm run ios:api`.
3. Use your hosting or tunnel account to forward the dedicated HTTPS API origin to `127.0.0.1:4310`.
4. Keep the terminal and HTTPS forwarding service running.
5. Use only disposable research data.

Device mode disables email login and legacy WebAuthn bypasses.
It requires real passkey assertions for `https://RP_DOMAIN`.
CORS separately permits the native origin `capacitor://localhost`.
This temporary API runs independently of the protected production deployment.

Never put `PRIVATE_BETA_PROXY_KEY`, database credentials, or hosting tokens in the app.
The legacy Fly/Vercel proxy path requires a server-only key. Never copy that key into the native client.
The persistent app instead uses the default-off [mobile admission path](docs/ops/mobile-beta.md).
This isolated prototype does not activate that path or remove the production guard.

### 4. Test the hosts

Run:

```sh
npm run ios:check-domain
```

This prototype-only command tests the public association file, API readiness, authentication-route access, and native CORS preflight.
Passing results do not establish Apple's association lookup or successful native authentication.

### 5. Sign and install

1. Run `npm run ios:sync`.
2. Run `npm run ios:open`.
3. In Xcode, select **App → Signing & Capabilities**.
4. Select your developer team.
5. Select **Automatically manage signing**.
6. Make sure the RP domain and bundle identifier match the generated association file.
7. Let Xcode register and provision the app identifier.
8. Connect and unlock your iPhone.
9. Trust the Mac on the iPhone.
10. If prompted, enable **Settings → Privacy & Security → Developer Mode**.
11. Select the iPhone as the Xcode run destination.
12. Select **Run**.
13. Complete any Apple account, device-trust, or keychain prompts yourself.

The project includes the **Associated Domains** entitlement as `webcredentials:$(BITSTOCKERZ_RP_ID)`.
The generated configuration supplies its domain value.

### 6. Register with a passkey

1. Enable iCloud Passwords & Keychain on the iPhone.
2. Set a device passcode if one is not already configured.
3. In the app, select **Create an account**.
4. Enter a disposable test email.
5. Select **Create account with a passkey**.
6. Approve the system Face ID or Touch ID prompt.
7. Select **Sign out**.
8. Sign in with the same email and passkey.

## iPhone acceptance checklist

- [ ] Create a passkey. Sign out and sign in with the same account using Face ID or the device passcode.
- [ ] Cancel the system prompt. Make sure the app shows an error and permits another attempt.
- [ ] Make sure a failed or mismatched challenge does not create an authenticated session.
- [ ] Force-quit and reopen. Make sure the app requires sign-in; native bearer tokens stay in memory only.
- [ ] Open the chart. Test pan, zoom, and rotation. Examine the OHLCV table.
- [ ] Create the starter strategy. Change the dates and costs. Run a backtest.
      Examine its equity curve, metrics, benchmark, and individual trades.
- [ ] Open the completed run from history. Make sure its original settings and results remain available.
- [ ] Export results and trades. Save each CSV to Files and open it.
- [ ] Disconnect the network and load a chart or backtest. Examine the error.
      Restore connectivity and try again. The prototype requires a reachable API.
- [ ] Test the keyboard, text size, VoiceOver labels, and landscape layout on the physical iPhone.
      Automated tests at phone width do not fully cover these behaviors.

## Verification and limits

The [testing strategy](docs/product/requirements/Testing_Strategy.md#ios-prototype-evidence) records the October 10 builds and tests.
Simulator and unsigned iPhone Debug builds passed. Simulator email registration and research screens were inspected.
Demo signing and installation were recorded in PR #19. Apple association lookup, native passkeys, sharing, and accessibility remain unverified.

The prototype requires network access and does not enable native OAuth.
It is not a TestFlight or App Store submission.
Prototype work did not purchase a domain, create paid resources, or deploy production.

Git ignores the generated `Prototype.xcconfig`, native environment file, web bundle, association setup files, and local endpoint settings.
After changing device configuration, run `ios:sync` again before building.

Useful local checks:

```sh
npm run ios:test:config
npm --prefix apps/web test -- --watch=false
npm --prefix apps/web run lint
npm --prefix apps/web run e2e -- e2e/ios-research.spec.ts
xcodebuild -project apps/web/ios/App/App.xcodeproj -scheme App \
  -configuration Debug -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath apps/web/ios/DerivedData CODE_SIGNING_ALLOWED=NO build
```

Run `ios:prepare` and `ios:sync` before the Xcode build command.
For an unsigned hardware compile, replace the destination with `generic/platform=iOS`.
An unsigned build cannot be installed on an iPhone.

Reference: [Capacitor iOS setup](https://capacitorjs.com/docs/ios) and
[Apple's passkey integration](https://developer.apple.com/documentation/authenticationservices/supporting-passkeys).
