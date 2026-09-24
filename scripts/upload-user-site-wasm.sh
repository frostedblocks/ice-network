#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
cd /home/walt_wood1/ice-network
cp -f /mnt/c/Users/walt_/ice-network/src/user_site/main.mo src/user_site/main.mo
dfx build user_site --network ic
WASM=".dfx/ic/canisters/user_site/user_site.wasm"
echo "WASM size: $(wc -c < "$WASM")"
dfx canister call factory clearUserSiteWasm --network ic
python3 <<'PY'
import subprocess, pathlib
data = pathlib.Path("/home/walt_wood1/ice-network/.dfx/ic/canisters/user_site/user_site.wasm").read_bytes()
chunk = 40000
for i in range(0, len(data), chunk):
    hx = data[i:i+chunk].hex()
    subprocess.check_call(
        ["dfx", "canister", "call", "factory", "appendUserSiteWasmHex", f'("{hx}")', "--network", "ic"]
    )
    print(f"chunk {i//chunk+1}")
print(subprocess.check_output(["dfx", "canister", "call", "factory", "finalizeUserSiteWasm", "--network", "ic"], text=True))
print(subprocess.check_output(["dfx", "canister", "call", "factory", "getWasmSize", "--network", "ic"], text=True))
PY
echo DONE
