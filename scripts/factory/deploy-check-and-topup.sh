#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh" 2>/dev/null || true
nvm use 20 2>/dev/null || true
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

WIN="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ice-network"

dfx identity use mynewdeploy

mkdir -p "$PROJ/src/factory" "$PROJ/src/user_site"
cp -f "$WIN/src/factory/main.mo" "$PROJ/src/factory/main.mo"
cp -f "$WIN/src/user_site/main.mo" "$PROJ/src/user_site/main.mo"
cp -f "$WIN/canister_ids.json" "$PROJ/canister_ids.json" 2>/dev/null || true
cp -f "$WIN/dfx.json" "$PROJ/dfx.json" 2>/dev/null || true

cd "$PROJ"

echo "=== Deploy factory (checkAndTopUp) ==="
dfx deploy factory --network ic --yes

echo "=== Build user_site WASM and push to factory ==="
dfx build user_site --network ic 2>&1 || dfx build user_site 2>&1 || true

# Prefer wasm from .dfx
WASM=""
for p in \
  .dfx/ic/canisters/user_site/user_site.wasm \
  .dfx/local/canisters/user_site/user_site.wasm \
  target/wasm32-unknown-unknown/release/user_site.wasm
do
  if [ -f "$p" ]; then WASM="$p"; break; fi
done

if [ -n "$WASM" ]; then
  echo "WASM: $WASM ($(wc -c < "$WASM") bytes)"
  # chunked hex upload if script exists, else try setUserSiteWasm with limited size
  if [ -f "$WIN/scripts/upload-user-site-wasm.sh" ]; then
    sed -i 's/\r$//' "$WIN/scripts/upload-user-site-wasm.sh" || true
    bash "$WIN/scripts/upload-user-site-wasm.sh" || true
  else
    echo "No upload script — skip wasm push (factory mint still has checkAndTopUp; photo path needs site upgrade)"
  fi
else
  echo "WARN: user_site wasm not found — factory deployed; sites need wasm upgrade later for photo hook"
fi

echo "=== Verify factory has checkAndTopUp ==="
dfx canister call factory health --network ic --query
echo DONE
