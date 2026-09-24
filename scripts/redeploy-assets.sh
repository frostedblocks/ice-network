#!/bin/bash
set -euo pipefail
export PATH="/home/walt_wood1/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
cd "$PROJ"
dfx identity use mynewdeploy

# Sync key frontend sources from Windows workspace
mkdir -p frontend/src frontend/public
# Sync frontend sources from Windows workspace (preserve local declarations/)
cp -f "$WIN/frontend/src/"*.jsx frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.js frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.css frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/index.html" frontend/index.html 2>/dev/null || true
cp -f "$WIN/frontend/public/landing.html" frontend/public/landing.html 2>/dev/null || true
cp -f "$WIN/frontend/public/how-to-join.html" frontend/public/how-to-join.html 2>/dev/null || true
cp -f "$WIN/frontend/.ic-assets.json" frontend/.ic-assets.json 2>/dev/null || true
# Ensure Candid IDL bindings exist
mkdir -p frontend/src/declarations/ice frontend/src/declarations/messaging
cp -f .dfx/ic/canisters/ice/service.did.js frontend/src/declarations/ice/ice.did.js 2>/dev/null || true
cp -f .dfx/ic/canisters/messaging/service.did.js frontend/src/declarations/messaging/messaging.did.js 2>/dev/null || true

ICE=$(dfx canister id ice --network ic)
MSG=$(dfx canister id messaging --network ic)
cd frontend
DFX_NETWORK=ic CANISTER_ID_ICE="$ICE" CANISTER_ID_MESSAGING="$MSG" npm run build
cp -f public/landing.html dist/landing.html 2>/dev/null || true
cp -f public/how-to-join.html dist/how-to-join.html 2>/dev/null || true
cp -f .ic-assets.json dist/.ic-assets.json 2>/dev/null || true
mkdir -p dist/.well-known
cp -f public/.well-known/ic-domains dist/.well-known/ 2>/dev/null || true
cd ..
dfx deploy assets --network ic --yes
echo "DONE assets"
