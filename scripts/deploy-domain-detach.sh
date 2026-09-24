#!/bin/bash
# Deploy domain/DNS-before-detach: factory + user_site wasm + assets
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20

WIN_SS="/mnt/c/Users/walt_/ScaleSpace"
WIN_ICE="/mnt/c/Users/walt_/ice-network"
PROJ_SS="/home/walt_wood1/ScaleSpace"
PROJ_ICE="/home/walt_wood1/ice-network"
HEX_CHUNK=16000

echo "=== Sync sources ==="
mkdir -p "$PROJ_ICE/src/factory" "$PROJ_ICE/src/user_site"
cp -f "$WIN_ICE/src/factory/main.mo" "$PROJ_ICE/src/factory/main.mo"
cp -f "$WIN_ICE/src/user_site/main.mo" "$PROJ_ICE/src/user_site/main.mo"
cp -f "$WIN_ICE/dfx.json" "$PROJ_ICE/dfx.json"
cp -f "$WIN_ICE/canister_ids.json" "$PROJ_ICE/canister_ids.json" 2>/dev/null || true

cp -f "$WIN_SS/frontend/src/"*.jsx "$PROJ_SS/frontend/src/" 2>/dev/null || true
cp -f "$WIN_SS/frontend/src/"*.js "$PROJ_SS/frontend/src/" 2>/dev/null || true
cp -f "$WIN_SS/frontend/src/declarations/factory/factory.did.js" "$PROJ_SS/frontend/src/declarations/factory/"
cp -f "$WIN_SS/frontend/src/declarations/user_site/user_site.did.js" "$PROJ_SS/frontend/src/declarations/user_site/"

echo "=== Deploy factory (domain index + hosting APIs) ==="
cd "$PROJ_ICE"
dfx identity use mynewdeploy
dfx deploy factory --network ic --yes

echo "=== Build user_site WASM + upload to factory ==="
dfx build user_site --network ic
WASM=".dfx/ic/canisters/user_site/user_site.wasm"
SIZE=$(wc -c < "$WASM" | tr -d ' ')
echo "wasm bytes=$SIZE"

dfx canister call factory clearUserSiteWasm --network ic

python3 - <<PY
import subprocess, pathlib, sys
wasm = pathlib.Path("$WASM").read_bytes()
assert wasm[:4] == b"\x00asm", f"bad magic {wasm[:4]!r}"
hexall = wasm.hex()
chunk = $HEX_CHUNK
n = 0
for i in range(0, len(hexall), chunk):
    part = hexall[i:i+chunk]
    arg = f'( "{part}" )'
    r = subprocess.run(
        ["dfx", "canister", "call", "factory", "appendUserSiteWasmHex", arg, "--network", "ic"],
        capture_output=True, text=True
    )
    n += 1
    if r.returncode != 0:
        print("FAIL", n, r.stderr or r.stdout)
        sys.exit(1)
    print(f"hex-chunk {n}: {len(part)//2} bytes")
print("chunks", n, "size", len(wasm))
PY

echo "=== finalize WASM ==="
dfx canister call factory finalizeUserSiteWasm --network ic
dfx canister call factory getWasmSize --network ic
dfx canister call factory getWasmMagicHex --network ic
dfx canister call factory health --network ic

echo "=== Deploy assets ==="
bash /mnt/c/Users/walt_/ScaleSpace/scripts/deploy-assets-only.sh
echo DONE
