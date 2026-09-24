#!/bin/bash
# Redeploy assets with /.well-known/ic-domains for frostedblocks.com
set -euo pipefail
export PATH="/home/walt_wood1/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

dfx identity use mynewdeploy
cd /home/walt_wood1/ScaleSpace

# Sync domain file from Windows workspace if present
if [ -f /mnt/c/Users/walt_/ScaleSpace/frontend/public/.well-known/ic-domains ]; then
  mkdir -p frontend/public/.well-known
  cp /mnt/c/Users/walt_/ScaleSpace/frontend/public/.well-known/ic-domains frontend/public/.well-known/
fi
if [ -f /mnt/c/Users/walt_/ScaleSpace/frontend/.ic-assets.json ]; then
  cp /mnt/c/Users/walt_/ScaleSpace/frontend/.ic-assets.json frontend/
fi

ICE=$(dfx canister id ice --network ic)
MSG=$(dfx canister id messaging --network ic)
echo "ice=$ICE messaging=$MSG"

cd frontend
DFX_NETWORK=ic CANISTER_ID_ICE="$ICE" CANISTER_ID_MESSAGING="$MSG" npm run build
cp -f .ic-assets.json dist/.ic-assets.json 2>/dev/null || true
# Ensure well-known landed in dist
mkdir -p dist/.well-known
cp -f public/.well-known/ic-domains dist/.well-known/ic-domains
echo "--- ic-domains content ---"
cat dist/.well-known/ic-domains
cd ..

dfx deploy assets --network ic

echo "--- verify on mainnet ---"
curl -sL "https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/.well-known/ic-domains"
echo ""
