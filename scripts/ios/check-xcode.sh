#!/bin/sh
# Xcode's Release configuration must never package a disposable demo.
set -eu
[ "${CONFIGURATION:-}" = Release ] || exit 0
fail() { echo "error: $1" >&2; exit 1; }
manifest="$SRCROOT/App/public/ios-build.local.json"
[ -f "$manifest" ] || fail 'Run ios:prepare and ios:sync:release before a Release build.'
field() { /usr/bin/plutil -extract "$1" raw -o - "$manifest"; }
[ "$CODE_SIGN_ENTITLEMENTS" = App/App.entitlements ] || fail 'Release requires the passkey entitlement file.'
channel=$(field mode)
case "$channel" in staging|production) ;; *) fail 'Release requires staging or production; demo builds use Debug.' ;; esac
[ "$channel" = "$BITSTOCKERZ_CHANNEL" ] || fail 'Stale channel settings; prepare and sync again.'
[ "$(field bundleId)" = "$PRODUCT_BUNDLE_IDENTIFIER" ] || fail 'Stale bundle identifier.'
[ "$(field teamId)" = "$DEVELOPMENT_TEAM" ] || fail 'Signing team differs from the prepared team.'
[ "$(field rpId)" = "$BITSTOCKERZ_RP_ID" ] || fail 'Stale relying-party domain.'
[ "$(field version)" = "$MARKETING_VERSION" ] || fail 'Stale app version.'
[ "$(field buildNumber)" = "$CURRENT_PROJECT_VERSION" ] || fail 'Stale build number.'
[ "$(field fingerprint)" = "$BITSTOCKERZ_FINGERPRINT" ] || fail 'Stale native build identity.'
/usr/bin/grep -l -F "$BITSTOCKERZ_FINGERPRINT" "$SRCROOT"/App/public/*.js >/dev/null || fail 'Stale compiled JavaScript.'
repository="$SRCROOT/../../../.."
[ "$(field sourceRevision)" = "$(/usr/bin/git -C "$repository" rev-parse HEAD)" ] || fail 'Source revision changed; prepare and sync again.'
if [ "$channel" = production ]; then
  [ -z "$(/usr/bin/git -C "$repository" status --porcelain --untracked-files=normal)" ] || fail 'Commit production source changes before preparing the build.'
fi
