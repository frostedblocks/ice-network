#!/bin/bash
set -euo pipefail
export PATH="/home/walt_wood1/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
cd "$PROJ"
dfx identity use mynewdeploy

echo "=== sync sources ==="
cp -f "$WIN/backend/main.mo" backend/main.mo
cp -f "$WIN/frontend/src/"*.jsx frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.js frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.css frontend/src/ 2>/dev/null || true
mkdir -p frontend/src/declarations/ice
cp -f "$WIN/frontend/src/declarations/ice/"* frontend/src/declarations/ice/ 2>/dev/null || true

echo "=== deploy ice (associates / follow / block) ==="
dfx deploy ice --network ic --yes

echo "=== refresh IDL ==="
mkdir -p frontend/src/declarations/ice
cp -f .dfx/ic/canisters/ice/service.did.js frontend/src/declarations/ice/ice.did.js
cp -f .dfx/ic/canisters/ice/service.did frontend/src/declarations/ice/ice.did
cp -f .dfx/ic/canisters/ice/service.did.d.ts frontend/src/declarations/ice/ice.did.d.ts 2>/dev/null || true
cp -f frontend/src/declarations/ice/* "$WIN/frontend/src/declarations/ice/" 2>/dev/null || true

ICE=$(dfx canister id ice --network ic)
MSG=$(dfx canister id messaging --network ic)

echo "=== build frontend ==="
cd frontend
DFX_NETWORK=ic CANISTER_ID_ICE="$ICE" CANISTER_ID_MESSAGING="$MSG" npm run build
cp -f public/*.html dist/ 2>/dev/null || true
cp -f .ic-assets.json dist/.ic-assets.json 2>/dev/null || true
mkdir -p dist/.well-known
cp -f public/.well-known/ic-domains dist/.well-known/ 2>/dev/null || true
cd ..

echo "=== deploy assets ==="
dfx deploy assets --network ic --yes

echo "=== smoke ==="
dfx canister call ice getCategories --network ic >/dev/null || true
echo "getAssociates type check via candid UI id=6jf55-2qaaa-aaaan-q6mwq-cai"
echo "DONE"
