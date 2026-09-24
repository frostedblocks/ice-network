#!/bin/bash
# Frontend assets only (no messaging/ice upgrade).
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"
dfx identity use mynewdeploy

WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
cd "$PROJ"

cat > canister_ids.json <<'EOF'
{
  "assets": { "ic": "6hhqv-baaaa-aaaan-q6mxq-cai" },
  "ice": { "ic": "6jf55-2qaaa-aaaan-q6mwq-cai" },
  "messaging": { "ic": "6agwb-myaaa-aaaan-q6mxa-cai" }
}
EOF

cp -f "$WIN/frontend/src/"*.jsx frontend/src/
cp -f "$WIN/frontend/src/"*.js frontend/src/
cp -f "$WIN/frontend/src/"*.css frontend/src/ 2>/dev/null || true
cp -rf "$WIN/frontend/src/declarations" frontend/src/
mkdir -p frontend/public/.well-known
cp -f "$WIN/frontend/public/"*.html frontend/public/ 2>/dev/null || true
mkdir -p frontend/public/admin
cp -f "$WIN/frontend/public/admin/"*.html frontend/public/admin/ 2>/dev/null || true
cp -f "$WIN/frontend/public/sitemap.xml" frontend/public/ 2>/dev/null || true
cp -f "$WIN/frontend/public/.well-known/"* frontend/public/.well-known/ 2>/dev/null || true
cp -f "$WIN/frontend/.ic-assets.json" frontend/.ic-assets.json 2>/dev/null || true
cp -f "$WIN/frontend/index.html" frontend/index.html 2>/dev/null || true

cd frontend
DFX_NETWORK=ic \
  CANISTER_ID_ICE=6jf55-2qaaa-aaaan-q6mwq-cai \
  CANISTER_ID_MESSAGING=6agwb-myaaa-aaaan-q6mxa-cai \
  VITE_CANISTER_ID_ICE=6jf55-2qaaa-aaaan-q6mwq-cai \
  VITE_CANISTER_ID_MESSAGING=6agwb-myaaa-aaaan-q6mxa-cai \
  VITE_CANISTER_ID_FACTORY=xfwx3-7yaaa-aaaas-qgxpq-cai \
  VITE_DFX_NETWORK=ic \
  npm run build
cp -f public/*.html dist/ 2>/dev/null || true
mkdir -p dist/admin
cp -f public/admin/*.html dist/admin/ 2>/dev/null || true
cp -f public/sitemap.xml dist/ 2>/dev/null || true
cp -f .ic-assets.json dist/ 2>/dev/null || true
mkdir -p dist/.well-known
cp -f public/.well-known/* dist/.well-known/ 2>/dev/null || true
# SPA alias: /referral serves the same app shell as index
cp -f dist/index.html dist/referral.html
cd ..

dfx deploy assets --network ic --yes
echo DONE
