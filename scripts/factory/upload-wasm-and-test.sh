#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:/home/walt_wood1/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

WIN="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ice-network"
# hex chars per call (~8KB binary = 16k hex) — keep under shell limits
HEX_CHUNK=16000

cd "$PROJ"
cp -f "$WIN/src/factory/main.mo" src/factory/main.mo
cp -f "$WIN/src/user_site/main.mo" src/user_site/main.mo
cp -f "$WIN/canister_ids.json" canister_ids.json
cp -f "$WIN/dfx.json" dfx.json

dfx identity use mynewdeploy
PRINCIPAL=$(dfx identity get-principal)
echo "principal=$PRINCIPAL"

echo "=== build + deploy factory ==="
dfx build --network ic
dfx deploy factory --network ic --yes
# rebuild user_site wasm for template
dfx build user_site --network ic

WASM=".dfx/ic/canisters/user_site/user_site.wasm"
SIZE=$(wc -c < "$WASM" | tr -d ' ')
echo "wasm file bytes=$SIZE"

echo "=== clear + hex-chunk upload ==="
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
    # Candid text argument
    arg = f'( "{part}" )'
    r = subprocess.run(
        ["dfx", "canister", "call", "factory", "appendUserSiteWasmHex", arg, "--network", "ic"],
        capture_output=True, text=True
    )
    n += 1
    if r.returncode != 0:
        print("FAIL", n, r.stderr or r.stdout)
        sys.exit(1)
    print(f"hex-chunk {n}: {len(part)//2} bytes -> {r.stdout.strip()}")
print("done chunks", n, "expected size", len(wasm))
PY

echo "=== verify magic + size ==="
dfx canister call factory getWasmSize --network ic
dfx canister call factory getWasmMagicHex --network ic
dfx canister call factory health --network ic
dfx canister call factory getFactoryCycles --network ic

echo "=== createUserSite ==="
dfx canister call factory createUserSite --network ic

echo "=== lookup ==="
dfx canister call factory getUserCanister "(principal \"$PRINCIPAL\")" --network ic
dfx canister call factory listActiveCanisters --network ic
echo DONE
