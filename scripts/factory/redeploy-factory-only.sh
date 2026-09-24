#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy
cd /home/walt_wood1/ice-network
cp -f /mnt/c/Users/walt_/ice-network/src/factory/main.mo src/factory/main.mo
dfx deploy factory --network ic --yes
dfx canister call factory getFees --network ic --query
echo DONE
