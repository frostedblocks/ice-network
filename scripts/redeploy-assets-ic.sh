#!/bin/bash
set -euo pipefail
export PATH="/home/walt_wood1/.local/share/dfx/bin:/usr/bin:/bin"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

dfx identity use mynewdeploy
cd /home/walt_wood1/ScaleSpace

cp /mnt/c/Users/walt_/ScaleSpace/frontend/src/Profile.jsx frontend/src/Profile.jsx
cp /mnt/c/Users/walt_/ScaleSpace/frontend/.ic-assets.json frontend/.ic-assets.json 2>/dev/null || true
cp /mnt/c/Users/walt_/ScaleSpace/frontend/public/.well-known/ic-domains frontend/public/.well-known/ic-domains 2>/dev/null || true

ICE=$(dfx canister id ice --network ic)
MSG=$(dfx canister id messaging --network ic)

cd frontend
DFX_NETWORK=ic CANISTER_ID_ICE="$ICE" CANISTER_ID_MESSAGING="$MSG" npm run build
cp -f .ic-assets.json dist/.ic-assets.json 2>/dev/null || true
mkdir -p dist/.well-known
cp -f public/.well-known/ic-domains dist/.well-known/ 2>/dev/null || true
cd ..

dfx deploy assets --network ic
echo "assets done"
