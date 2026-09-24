#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ice-network
dfx identity use mynewdeploy
dfx canister call factory getWasmSize --network ic --query
dfx canister call factory adminPushLatestWasmToAll '(20 : nat)' --network ic
echo DONE
