#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20

WIN_ICE="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ice-network"
WIN_SS="/mnt/c/Users/walt_/ScaleSpace"

echo "=== Sync ice-network sources ==="
mkdir -p "$PROJ/src/factory" "$PROJ/src/user_site"
cp -f "$WIN_ICE/src/factory/main.mo" "$PROJ/src/factory/main.mo"
cp -f "$WIN_ICE/src/user_site/main.mo" "$PROJ/src/user_site/main.mo"
cp -f "$WIN_ICE/dfx.json" "$PROJ/dfx.json" 2>/dev/null || true

cd "$PROJ"

echo "=== Build user_site + factory ==="
dfx build user_site --network ic
dfx build factory --network ic

WASM="$PROJ/.dfx/ic/canisters/user_site/user_site.wasm"
if [ ! -f "$WASM" ]; then
  WASM=$(find "$PROJ/.dfx" -name "user_site.wasm" | head -1)
fi
echo "WASM: $WASM ($(wc -c < "$WASM") bytes)"

echo "=== Deploy factory ==="
dfx deploy factory --network ic --yes

echo "=== Upload user_site WASM to factory ==="
dfx canister call factory clearUserSiteWasm --network ic
# chunk hex upload ~100KB hex chars per call (~50KB binary)
python3 - <<'PY'
import subprocess, pathlib, sys
wasm = pathlib.Path("/home/walt_wood1/ice-network/.dfx/ic/canisters/user_site/user_site.wasm")
if not wasm.exists():
    cands = list(pathlib.Path("/home/walt_wood1/ice-network/.dfx").rglob("user_site.wasm"))
    if not cands:
        sys.exit("no wasm")
    wasm = cands[0]
data = wasm.read_bytes()
print(f"uploading {len(data)} bytes from {wasm}")
chunk = 40_000  # bytes per chunk -> 80k hex
for i in range(0, len(data), chunk):
    part = data[i:i+chunk]
    hx = part.hex()
    r = subprocess.run(
        ["dfx", "canister", "call", "factory", "appendUserSiteWasmHex", f'("{hx}")', "--network", "ic"],
        capture_output=True, text=True
    )
    if r.returncode != 0:
        print(r.stdout, r.stderr)
        sys.exit(r.returncode)
    print(f"  chunk {i//chunk+1}: {len(part)} bytes -> {r.stdout.strip()}")
r = subprocess.run(
    ["dfx", "canister", "call", "factory", "finalizeUserSiteWasm", "--network", "ic"],
    capture_output=True, text=True
)
print(r.stdout, r.stderr)
if r.returncode != 0:
    sys.exit(r.returncode)
PY

echo "=== factory health / wasm size ==="
dfx canister call factory getWasmSize --network ic
dfx canister call factory getWasmMagicHex --network ic
dfx canister call factory health --network ic
dfx canister call factory getFees --network ic

echo "=== Deploy ICE frontend assets ==="
bash /mnt/c/Users/walt_/ScaleSpace/scripts/deploy-assets-only.sh

echo DONE
