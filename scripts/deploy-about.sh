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

cp -f "$WIN/frontend/public/about.html" frontend/public/about.html
# Keep other public pages too
cp -f "$WIN/frontend/public/landing.html" frontend/public/landing.html 2>/dev/null || true
cp -f "$WIN/frontend/public/how-to-join.html" frontend/public/how-to-join.html 2>/dev/null || true

ICE=$(dfx canister id ice --network ic)
MSG=$(dfx canister id messaging --network ic)
cd frontend
DFX_NETWORK=ic CANISTER_ID_ICE="$ICE" CANISTER_ID_MESSAGING="$MSG" npm run build
cp -f public/about.html dist/about.html
cp -f public/landing.html dist/landing.html 2>/dev/null || true
cp -f public/how-to-join.html dist/how-to-join.html 2>/dev/null || true
cp -f .ic-assets.json dist/.ic-assets.json 2>/dev/null || true
mkdir -p dist/.well-known
cp -f public/.well-known/ic-domains dist/.well-known/ 2>/dev/null || true
echo "dist about bytes: $(wc -c < dist/about.html)"
cd ..
dfx deploy assets --network ic --yes
sleep 2
echo "live title check:"
curl -sL "https://6hhqv-baaaa-aaaan-q6mxq-cai.raw.icp0.io/about.html" | grep -E "<title>|What is ICE" | head -5
echo "DONE"
