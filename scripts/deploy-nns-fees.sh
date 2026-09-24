#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20

WIN="/mnt/c/Users/walt_/ScaleSpace"
ICE="/mnt/c/Users/walt_/ice-network"
PROJ_SS="/home/walt_wood1/ScaleSpace"
PROJ_ICE="/home/walt_wood1/ice-network"

echo "=== Sync sources ==="
cp -f "$WIN/backend/main.mo" "$PROJ_SS/backend/main.mo"
cp -f "$ICE/src/factory/main.mo" "$PROJ_ICE/src/factory/main.mo"
cp -f "$WIN/frontend/src/"*.jsx "$PROJ_SS/frontend/src/" 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.js "$PROJ_SS/frontend/src/" 2>/dev/null || true
cp -f "$WIN/frontend/src/declarations/ice/ice.did.js" "$PROJ_SS/frontend/src/declarations/ice/"
cp -f "$WIN/frontend/src/declarations/factory/factory.did.js" "$PROJ_SS/frontend/src/declarations/factory/"

echo "=== Deploy ice ==="
cd "$PROJ_SS"
dfx identity use mynewdeploy
dfx deploy ice --network ic --yes

echo "=== Deploy factory ==="
cd "$PROJ_ICE"
dfx deploy factory --network ic --yes

echo "=== Deploy assets ==="
bash /mnt/c/Users/walt_/ScaleSpace/scripts/deploy-assets-only.sh
echo DONE
