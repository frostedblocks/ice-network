#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:/home/walt_wood1/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

WIN="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ice-network"
mkdir -p "$PROJ/src/factory" "$PROJ/src/user_site" "$PROJ/scripts"

cp -f "$WIN/dfx.json" "$PROJ/dfx.json"
cp -f "$WIN/canister_ids.json" "$PROJ/canister_ids.json"
cp -f "$WIN/src/factory/main.mo" "$PROJ/src/factory/main.mo"
cp -f "$WIN/src/user_site/main.mo" "$PROJ/src/user_site/main.mo"
cp -f "$WIN/README.md" "$PROJ/README.md" 2>/dev/null || true

cd "$PROJ"
dfx identity use mynewdeploy
echo "principal: $(dfx identity get-principal)"
cat canister_ids.json

echo "=== build ==="
dfx build --network ic

echo "=== install factory (Master Factory) ==="
dfx canister install factory --network ic --mode reinstall --yes --argument '()'

echo "=== install user_site (User_Site) ==="
dfx canister install user_site --network ic --mode reinstall --yes --argument '(principal "aaaaa-aa")'

echo "=== claim factory owner ==="
dfx canister call factory claimOwner --network ic

echo "=== smoke ==="
dfx canister call factory health --network ic
dfx canister call factory getWasmSize --network ic
dfx canister call user_site getOwner --network ic
dfx canister call user_site getCyclesGauge --network ic

echo "=== status ==="
dfx canister status factory --network ic
dfx canister status user_site --network ic

# After build, store user_site wasm into factory for provisioning
WASM=".dfx/ic/canisters/user_site/user_site.wasm"
if [ -f "$WASM" ]; then
  echo "=== upload user_site WASM into factory ==="
  # Encode wasm as candid blob via dfx
  # dfx canister call with blob from file is awkward; use candid-extractor approach via xxd
  SIZE=$(wc -c < "$WASM" | tr -d ' ')
  echo "wasm size bytes: $SIZE"
  # Prefer installing via Python candid encode if available, else skip with note
  if command -v python3 >/dev/null 2>&1; then
    python3 - <<'PY' || true
import subprocess, pathlib
wasm = pathlib.Path(".dfx/ic/canisters/user_site/user_site.wasm").read_bytes()
# candid blob = vec nat8 — dfx accepts blob "hex..."
hexblob = wasm.hex()
# chunk risk if huge — user_site should be small
arg = f'(blob "{hexblob}")'
# write to file for dfx
pathlib.Path("/tmp/set_wasm.arg").write_text(arg)
print("arg_chars", len(arg))
PY
    # Only upload if reasonable size (< 2MB hex is large)
    if [ "$SIZE" -lt 1500000 ]; then
      HEX=$(xxd -p -c 256 "$WASM" | tr -d '\n')
      dfx canister call factory setUserSiteWasm "(blob \"$HEX\")" --network ic || \
        echo "WARN: setUserSiteWasm failed (may need chunked upload later)"
    else
      echo "WARN: wasm too large for inline hex call; set via Candid UI later"
    fi
  fi
fi

echo ""
echo "========================================"
echo "Master Factory: https://a4gq6-oaaaa-aaaab-qaa4q-cai.raw.icp0.io/?id=xfwx3-7yaaa-aaaas-qgxpq-cai"
echo "User_Site:      https://a4gq6-oaaaa-aaaab-qaa4q-cai.raw.icp0.io/?id=sznn6-uqaaa-aaaas-qgxqa-cai"
echo "Repo: https://github.com/frostedblocks/ice-network"
echo "========================================"
echo "DONE"
