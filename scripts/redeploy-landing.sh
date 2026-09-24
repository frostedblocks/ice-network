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

cp -f "$WIN/frontend/public/landing.html" frontend/public/landing.html
cp -f "$WIN/frontend/.ic-assets.json" frontend/.ic-assets.json

echo "public Self-contained: $(grep -c Self-contained frontend/public/landing.html || true)"
echo "public tailwind: $(grep -c cdn.tailwindcss frontend/public/landing.html || true)"

ICE=$(dfx canister id ice --network ic)
MSG=$(dfx canister id messaging --network ic)
cd frontend
DFX_NETWORK=ic CANISTER_ID_ICE="$ICE" CANISTER_ID_MESSAGING="$MSG" npm run build
cp -f public/landing.html dist/landing.html
cp -f .ic-assets.json dist/.ic-assets.json
mkdir -p dist/.well-known
cp -f public/.well-known/ic-domains dist/.well-known/ 2>/dev/null || true
echo "dist Self-contained: $(grep -c Self-contained dist/landing.html || true)"
echo "dist tailwind: $(grep -c cdn.tailwindcss dist/landing.html || true)"
echo "dist bytes: $(wc -c < dist/landing.html)"
cd ..

dfx deploy assets --network ic --yes

sleep 3
echo "raw Self-contained: $(curl -sL 'https://6hhqv-baaaa-aaaan-q6mxq-cai.raw.icp0.io/landing.html' | grep -c Self-contained || true)"
echo "raw tailwind: $(curl -sL 'https://6hhqv-baaaa-aaaan-q6mxq-cai.raw.icp0.io/landing.html' | grep -c cdn.tailwindcss || true)"
echo "raw bytes: $(curl -sL 'https://6hhqv-baaaa-aaaan-q6mxq-cai.raw.icp0.io/landing.html' | wc -c)"
echo "DONE"
