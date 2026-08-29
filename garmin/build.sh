#!/usr/bin/env bash
# Build the ImuaTrak Connect IQ app.
#
#   ./build.sh                      debug .prg for the simulator (fenix7)
#   ./build.sh --device fenix8solar47mm
#   ./build.sh --store              .iq package for the Connect IQ Store
#
# Requires the Connect IQ SDK on PATH (monkeyc) and a developer key. Generate a
# key once with:
#   openssl genrsa -out developer_key.pem 4096
#   openssl pkcs8 -topk8 -inform PEM -outform DER -in developer_key.pem \
#           -out developer_key.der -nocrypt
# and keep it OUT of the repo — it is this app's identity in the store.
set -euo pipefail

cd "$(dirname "$0")"

DEVICE="fenix7"
STORE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --device) DEVICE="$2"; shift 2 ;;
    --store)  STORE=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

DEVELOPER_KEY="${GARMIN_DEVELOPER_KEY:-developer_key.der}"
if [[ ! -f "$DEVELOPER_KEY" ]]; then
  echo "Developer key not found at $DEVELOPER_KEY (set GARMIN_DEVELOPER_KEY)" >&2
  exit 1
fi

# The Firebase project id and app version are baked into string resources, the
# same way the Wear app injects them through BuildConfig. Build from a copy so
# the placeholders stay in git and the working tree is never left substituted.
PROJECT_ID="${EXPO_PUBLIC_FIREBASE_PROJECT_ID:-}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "warning: EXPO_PUBLIC_FIREBASE_PROJECT_ID unset — the watch will record" >&2
  echo "         and queue sessions but never upload them." >&2
fi
APP_VERSION="$(node -p "require('./../app.config.js')({config:{}}).version" 2>/dev/null || echo 0.0.0)"

SRC="build/src"
rm -rf build && mkdir -p "$SRC"
cp -R manifest.xml monkey.jungle source resources "$SRC/"

STRINGS="$SRC/resources/strings/strings.xml"
sed -i.bak "s|__FIREBASE_PROJECT_ID__|${PROJECT_ID}|" "$STRINGS"
sed -i.bak "s|<string id=\"AppVersion\">[^<]*</string>|<string id=\"AppVersion\">${APP_VERSION}</string>|" "$STRINGS"
rm -f "$STRINGS.bak"

if [[ "$STORE" == "1" ]]; then
  # -e packages every product in the manifest for store upload.
  monkeyc -f "$SRC/monkey.jungle" -o build/imuatrak.iq -y "$DEVELOPER_KEY" -e -w
  echo "built build/imuatrak.iq"
else
  monkeyc -f "$SRC/monkey.jungle" -o build/imuatrak.prg -y "$DEVELOPER_KEY" -d "$DEVICE" -w
  echo "built build/imuatrak.prg for $DEVICE — run: monkeydo build/imuatrak.prg $DEVICE"
fi
