#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20

WIN_ICE="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ice-network"
cp -f "$WIN_ICE/src/factory/main.mo" "$PROJ/src/factory/main.mo"
cd "$PROJ"

echo "=== Deploy factory ==="
dfx deploy factory --network ic --yes

echo "=== Quotes after fix ==="
dfx canister call factory quoteTopUpIcpE8s '(500_000_000_000 : nat)' --network ic
dfx canister call factory getFees --network ic
dfx canister call factory health --network ic

echo "=== Frontend ==="
bash /mnt/c/Users/walt_/ScaleSpace/scripts/deploy-assets-only.sh
echo DONE
