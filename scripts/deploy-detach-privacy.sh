#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

WIN_SS="/mnt/c/Users/walt_/ScaleSpace"
WIN_ICE="/mnt/c/Users/walt_/ice-network"
PROJ_SS="/home/walt_wood1/ScaleSpace"
PROJ_ICE="/home/walt_wood1/ice-network"

dfx identity use mynewdeploy

echo "=== Deploy ICE backend ==="
cd "$PROJ_SS"
cp -f "$WIN_SS/backend/main.mo" backend/main.mo
cat > canister_ids.json <<'EOF'
{
  "assets": { "ic": "6hhqv-baaaa-aaaan-q6mxq-cai" },
  "ice": { "ic": "6jf55-2qaaa-aaaan-q6mwq-cai" },
  "messaging": { "ic": "6agwb-myaaa-aaaan-q6mxa-cai" }
}
EOF
dfx deploy ice --network ic --yes

echo "=== Deploy factory (detach/relink privacy hooks) ==="
cd "$PROJ_ICE"
cp -f "$WIN_ICE/src/factory/main.mo" src/factory/main.mo
cp -f "$WIN_ICE/canister_ids.json" canister_ids.json
dfx deploy factory --network ic --yes

echo "=== Deploy assets ==="
cd "$PROJ_SS"
cp -f "$WIN_SS/frontend/src/"*.jsx frontend/src/
cp -f "$WIN_SS/frontend/src/"*.js frontend/src/
cp -rf "$WIN_SS/frontend/src/declarations" frontend/src/
cd frontend
DFX_NETWORK=ic \
  CANISTER_ID_ICE=6jf55-2qaaa-aaaan-q6mwq-cai \
  CANISTER_ID_MESSAGING=6agwb-myaaa-aaaan-q6mxa-cai \
  VITE_CANISTER_ID_FACTORY=xfwx3-7yaaa-aaaas-qgxpq-cai \
  npm run build
cp -f public/*.html dist/ 2>/dev/null || true
cp -f .ic-assets.json dist/ 2>/dev/null || true
mkdir -p dist/.well-known
cp -f public/.well-known/* dist/.well-known/ 2>/dev/null || true
cd ..
dfx deploy assets --network ic --yes

echo DONE
