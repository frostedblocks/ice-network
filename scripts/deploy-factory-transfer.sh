#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"
dfx identity use mynewdeploy >/dev/null

WIN_FAC="/mnt/c/Users/walt_/ice-network"
HOME_FAC="/home/walt_wood1/ice-network"
WIN_SS="/mnt/c/Users/walt_/ScaleSpace"
HOME_SS="/home/walt_wood1/ScaleSpace"

mkdir -p "$HOME_FAC/src/factory"
cp -f "$WIN_FAC/src/factory/main.mo" "$HOME_FAC/src/factory/main.mo"
cp -f "$WIN_FAC/dfx.json" "$HOME_FAC/dfx.json" 2>/dev/null || true
cp -f "$WIN_FAC/canister_ids.json" "$HOME_FAC/canister_ids.json" 2>/dev/null || true

cd "$HOME_FAC"
echo "=== deploy factory ==="
dfx deploy factory --network ic --yes

mkdir -p "$HOME_SS/frontend/src/declarations/factory"
mkdir -p "$WIN_SS/frontend/src/declarations/factory"
# Copy candid from .dfx
if [ -f .dfx/ic/canisters/factory/service.did.js ]; then
  cp -f .dfx/ic/canisters/factory/service.did.js "$HOME_SS/frontend/src/declarations/factory/factory.did.js"
  cp -f .dfx/ic/canisters/factory/service.did "$HOME_SS/frontend/src/declarations/factory/factory.did"
  cp -f .dfx/ic/canisters/factory/service.did.js "$WIN_SS/frontend/src/declarations/factory/factory.did.js"
  cp -f .dfx/ic/canisters/factory/service.did "$WIN_SS/frontend/src/declarations/factory/factory.did"
fi
# Also sync into ice-network declarations if present
mkdir -p src/declarations/factory
cp -f .dfx/ic/canisters/factory/service.did.js src/declarations/factory/ 2>/dev/null || true

echo "=== smoke transfer queries ==="
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai getFees --network ic --query
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai getTransferLog "(5:nat)" --network ic --query

echo DONE
