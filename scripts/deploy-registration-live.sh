#!/bin/bash
set -euo pipefail
export PATH="/home/walt_wood1/.local/share/dfx/bin:/usr/bin:/bin"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

dfx identity use mynewdeploy
WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
cd "$PROJ"

cp "$WIN/backend/main.mo" backend/main.mo
cp "$WIN/frontend/src/App.jsx" frontend/src/App.jsx
cp "$WIN/frontend/src/Subscribe.jsx" frontend/src/Subscribe.jsx
cp "$WIN/frontend/src/Messaging.jsx" frontend/src/Messaging.jsx
cp "$WIN/frontend/src/Register.jsx" frontend/src/Register.jsx
cp "$WIN/frontend/src/icpLedger.js" frontend/src/icpLedger.js
cp "$WIN/frontend/src/Profile.jsx" frontend/src/Profile.jsx 2>/dev/null || true

echo "=== deploy ice ==="
dfx deploy ice --network ic

ICE=$(dfx canister id ice --network ic)
MSG=$(dfx canister id messaging --network ic)

cd frontend
DFX_NETWORK=ic CANISTER_ID_ICE="$ICE" CANISTER_ID_MESSAGING="$MSG" npm run build
cp -f .ic-assets.json dist/.ic-assets.json 2>/dev/null || true
mkdir -p dist/.well-known
cp -f public/.well-known/ic-domains dist/.well-known/ 2>/dev/null || true
cd ..

echo "=== deploy assets ==="
dfx deploy assets --network ic
echo "DONE https://$(dfx canister id assets --network ic).icp0.io/"
