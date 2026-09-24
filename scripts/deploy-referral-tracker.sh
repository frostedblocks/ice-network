#!/bin/bash
# Deploy ICE referral tracker + frontend assets
set -euo pipefail
export PATH="/home/walt_wood1/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

dfx identity use mynewdeploy
WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
cd "$PROJ"

cp -f "$WIN/backend/main.mo" backend/main.mo
cp -f "$WIN/frontend/src/MasterReferralTracker.jsx" frontend/src/MasterReferralTracker.jsx
cp -f "$WIN/frontend/src/InviteCard.jsx" frontend/src/InviteCard.jsx
cp -f "$WIN/frontend/src/Profile.jsx" frontend/src/Profile.jsx
cp -f "$WIN/frontend/src/declarations/ice/ice.did" frontend/src/declarations/ice/ice.did
cp -f "$WIN/frontend/src/declarations/ice/ice.did.js" frontend/src/declarations/ice/ice.did.js

echo "=== deploy ice ==="
dfx deploy ice --network ic --yes

ICE=$(dfx canister id ice --network ic)
MSG=$(dfx canister id messaging --network ic)

# Sync generated did if present
if [ -f ".dfx/ic/canisters/ice/service.did.js" ]; then
  cp -f .dfx/ic/canisters/ice/service.did.js "$WIN/frontend/src/declarations/ice/ice.did.js" 2>/dev/null || true
  cp -f .dfx/ic/canisters/ice/service.did.js frontend/src/declarations/ice/ice.did.js 2>/dev/null || true
fi
if [ -f ".dfx/ic/canisters/ice/service.did" ]; then
  cp -f .dfx/ic/canisters/ice/service.did "$WIN/frontend/src/declarations/ice/ice.did" 2>/dev/null || true
  cp -f .dfx/ic/canisters/ice/service.did frontend/src/declarations/ice/ice.did 2>/dev/null || true
fi

cd frontend
DFX_NETWORK=ic \
  CANISTER_ID_ICE="$ICE" \
  CANISTER_ID_MESSAGING="$MSG" \
  VITE_CANISTER_ID_ICE="$ICE" \
  VITE_CANISTER_ID_MESSAGING="$MSG" \
  VITE_CANISTER_ID_FACTORY=xfwx3-7yaaa-aaaas-qgxpq-cai \
  VITE_DFX_NETWORK=ic \
  npm run build
cp -f .ic-assets.json dist/.ic-assets.json 2>/dev/null || true
mkdir -p dist/.well-known
cp -f public/.well-known/* dist/.well-known/ 2>/dev/null || true
cd ..

echo "=== deploy assets ==="
dfx deploy assets --network ic --yes
echo "DONE https://frostedblocks.com/ (assets $ICE ice)"
