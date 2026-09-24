#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"

SITE="sll2h-yaaaa-aaaas-qgxta-cai"
OWNER="kzncb-ht5cl-o2gik-fey7v-atztx-yzkmf-x3c5c-tvpwh-da6ny-x6wmu-fae"
FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"
ICE="6jf55-2qaaa-aaaan-q6mwq-cai"
PROJ="/home/walt_wood1/ice-network"
cd "$PROJ"

echo "=== controllers / status ==="
dfx canister info "$SITE" --network ic
dfx canister --network ic status "$SITE" 2>&1 | head -18

echo "=== getOwner (may fail if old interface) ==="
dfx canister call "$SITE" getOwner --network ic 2>&1 || true

echo "=== Ensure WASM built ==="
dfx build user_site --network ic
WASM="$PROJ/.dfx/ic/canisters/user_site/user_site.wasm"
if [ ! -f "$WASM" ]; then
  WASM=$(find "$PROJ/.dfx" -name "user_site.wasm" | head -1)
fi
echo "WASM=$WASM ($(wc -c < "$WASM") bytes)"

# Init arg: owner principal (UserSite(initOwner))
# candid: (principal "...")
INIT_ARG="(principal \"$OWNER\")"

echo "=== Upgrade install (mode upgrade, keep state if possible) ==="
# Try upgrade first; if fails, reinstall with init
if dfx canister install "$SITE" --network ic --mode upgrade --wasm "$WASM" --argument "$INIT_ARG" --yes 2>&1; then
  echo "Upgrade OK"
else
  echo "Upgrade failed — trying reinstall (wipes heap/stable for this canister)"
  dfx canister install "$SITE" --network ic --mode reinstall --wasm "$WASM" --argument "$INIT_ARG" --yes
  echo "Reinstall OK"
fi

echo "=== Bootstrap new DB + profile page ==="
# bootstrap(factory, iceMain, username, bio, avatarURL)
dfx canister call "$SITE" bootstrap "(
  principal \"$FACTORY\",
  principal \"$ICE\",
  \"Member\",
  \"A quieter place for real conversation.\",
  \"\"
)" --network ic 2>&1 || true

echo "=== Verify ==="
dfx canister info "$SITE" --network ic
dfx canister call "$SITE" getOwner --network ic
dfx canister call "$SITE" getProfile --network ic 2>&1 || true
dfx canister call "$SITE" listPages --network ic 2>&1 || true
dfx canister call "$SITE" getCyclesGauge --network ic 2>&1 || true
dfx canister call "$SITE" getSiteStatus --network ic 2>&1 || true

echo "=== Ensure factory link ==="
dfx canister call factory adminLinkUserCanister "(
  principal \"$OWNER\",
  principal \"$SITE\"
)" --network ic 2>&1 || true
dfx canister call factory getUserCanister "(principal \"$OWNER\")" --network ic

echo "=== Sole controller = owner (if we still control) ==="
# dfx is controller currently; set sole controller to user after upgrade
dfx canister update-settings "$SITE" --network ic --set-controller "$OWNER" --yes 2>&1 || \
  dfx canister update-settings "$SITE" --add-controller "$OWNER" --network ic --yes 2>&1 || true

# After --set-controller only owner remains (if it worked)
dfx canister info "$SITE" --network ic 2>&1 || true

echo DONE
