#!/bin/bash
set -euo pipefail
export PATH="/home/walt_wood1/.local/share/dfx/bin:/usr/local/bin:/usr/bin:/bin"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm use 20
# nvm may reorder PATH; put dfx first again
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

dfx identity use mynewdeploy
cd /home/walt_wood1/ScaleSpace

echo "=== deploy messaging ==="
dfx deploy messaging --network ic --with-cycles 1500000000000

ICE=$(dfx canister id ice --network ic)
MSG=$(dfx canister id messaging --network ic)
echo "ICE=$ICE"
echo "MSG=$MSG"

# root canister ids for vite
if [ -f .dfx/ic/canister_ids.json ]; then
  cp -f .dfx/ic/canister_ids.json canister_ids.json || true
fi

cat > frontend/.env.production <<EOF
DFX_NETWORK=ic
CANISTER_ID_ICE=${ICE}
CANISTER_ID_MESSAGING=${MSG}
EOF

echo "=== build frontend ==="
cd frontend
DFX_NETWORK=ic CANISTER_ID_ICE="$ICE" CANISTER_ID_MESSAGING="$MSG" npm run build
cp -f .ic-assets.json dist/.ic-assets.json 2>/dev/null || true
cd ..

echo "=== deploy assets ==="
dfx deploy assets --network ic --with-cycles 1500000000000

ASSETS=$(dfx canister id assets --network ic)
echo ""
echo "=============================================="
echo " LIVE"
echo " App: https://${ASSETS}.icp0.io/"
echo " ice: ${ICE}"
echo " messaging: ${MSG}"
echo " assets: ${ASSETS}"
echo "=============================================="
dfx cycles balance --network ic
