#!/bin/bash
# Hard-clean Master Factory memory: uninstall-code + reinstall, then stage WASM + finalize once.
set -euo pipefail
export PATH="/usr/bin:/bin:/home/walt_wood1/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

WIN="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ice-network"
FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"
SITE="sxpaw-paaaa-aaaas-qgxra-cai"
II_PRINCIPAL="4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe"
HEX_CHUNK=16000

cd "$PROJ"
cp -f "$WIN/src/factory/main.mo" src/factory/main.mo
cp -f "$WIN/src/user_site/main.mo" src/user_site/main.mo
cp -f "$WIN/canister_ids.json" canister_ids.json
cp -f "$WIN/dfx.json" dfx.json

dfx identity use mynewdeploy

echo "=== BEFORE ==="
dfx canister status "$FACTORY" --network ic | grep -E "Memory Size|Balance|Idle"

echo "=== build ==="
dfx build --network ic

echo "=== uninstall-code (clear code + state + free memory pages) ==="
dfx canister uninstall-code factory --network ic

echo "=== after uninstall ==="
dfx canister status "$FACTORY" --network ic | grep -E "Memory Size|Balance|Status|Module" || true

echo "=== install factory fresh ==="
dfx canister install factory --network ic --mode install --yes --argument '()'

echo "=== claim owner ==="
dfx canister call factory claimOwner --network ic

echo "=== stage WASM in heap, finalize once to stable ==="
WASM=".dfx/ic/canisters/user_site/user_site.wasm"
SIZE=$(wc -c < "$WASM" | tr -d ' ')
echo "wasm bytes=$SIZE"

dfx canister call factory clearUserSiteWasm --network ic

python3 - <<PY
import subprocess, pathlib, sys
wasm = pathlib.Path("$WASM").read_bytes()
assert wasm[:4] == b"\x00asm"
hexall = wasm.hex()
chunk = $HEX_CHUNK
n = 0
for i in range(0, len(hexall), chunk):
    part = hexall[i:i+chunk]
    arg = f'( "{part}" )'
    r = subprocess.run(
        ["dfx", "canister", "call", "factory", "appendUserSiteWasmHex", arg, "--network", "ic"],
        capture_output=True, text=True,
    )
    n += 1
    if r.returncode != 0:
        print("FAIL", n, r.stderr or r.stdout)
        sys.exit(1)
print("staged chunks", n)
PY

dfx canister call factory finalizeUserSiteWasm --network ic
dfx canister call factory getWasmSize --network ic
dfx canister call factory getWasmMagicHex --network ic

echo "=== re-link user ==="
dfx canister call factory adminLinkUserCanister \
  "(principal \"$II_PRINCIPAL\", principal \"$SITE\")" --network ic
dfx canister update-settings "$SITE" --add-controller "$II_PRINCIPAL" --network ic 2>/dev/null || true
# factory must control personal sites for future upgrades — ensure factory still controller
dfx canister update-settings "$SITE" --add-controller "$FACTORY" --network ic 2>/dev/null || true

echo "=== AFTER ==="
dfx canister status "$FACTORY" --network ic | grep -E "Memory Size|Balance|Idle|Module"
dfx canister call factory health --network ic
dfx canister call factory getUserCanister "(principal \"$II_PRINCIPAL\")" --network ic

echo DONE
