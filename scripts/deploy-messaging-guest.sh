#!/bin/bash
# Deploy messaging canister (guest inbox APIs) + frontend assets.
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

mkdir -p messaging frontend/src/declarations
cp -f "$WIN/messaging/main.mo" messaging/main.mo
cp -f "$WIN/frontend/src/"*.jsx frontend/src/
cp -f "$WIN/frontend/src/"*.js frontend/src/
cp -f "$WIN/frontend/src/"*.css frontend/src/ 2>/dev/null || true
cp -rf "$WIN/frontend/src/declarations" frontend/src/
cp -f "$WIN/dfx.json" dfx.json 2>/dev/null || true

echo "=== Deploy messaging ==="
dfx deploy messaging --network ic --yes

echo "=== Build frontend ==="
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
cp -f public/sitemap.xml dist/ 2>/dev/null || true
cd ..

echo "=== Deploy assets ==="
# Avoid rebuilding ice/messaging as assets deps — assets only.
dfx deploy assets --network ic --yes --no-wallet 2>/dev/null || dfx deploy assets --network ic --yes
echo DONE
