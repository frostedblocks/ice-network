#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy

cd /home/walt_wood1/ice-network
echo "=== WASM size on factory ==="
dfx canister call factory getWasmSize --network ic --query
echo "=== Push to sites ==="
dfx canister call factory adminPushLatestWasmToAll '(20 : nat)' --network ic

cd /home/walt_wood1/ScaleSpace
echo "=== Deploy assets ==="
dfx deploy assets --network ic --yes
echo DONE
