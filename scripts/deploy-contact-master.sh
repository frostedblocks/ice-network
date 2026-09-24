#!/bin/bash
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

cp -f "$WIN/backend/main.mo" backend/main.mo
cp -f "$WIN/frontend/src/"*.jsx frontend/src/
cp -f "$WIN/frontend/src/"*.js frontend/src/
cp -f "$WIN/frontend/src/"*.css frontend/src/ 2>/dev/null || true
cp -rf "$WIN/frontend/src/declarations" frontend/src/

echo "=== Deploy ICE ==="
dfx deploy ice --network ic --yes

echo "=== Build + deploy assets ==="
cd frontend
DFX_NETWORK=ic \
  CANISTER_ID_ICE=6jf55-2qaaa-aaaan-q6mwq-cai \
  CANISTER_ID_MESSAGING=6agwb-myaaa-aaaan-q6mxa-cai \
  VITE_CANISTER_ID_FACTORY=xfwx3-7yaaa-aaaas-qgxpq-cai \
  npm run build
cp -f public/*.html dist/ 2>/dev/null || true
cd ..
dfx deploy assets --network ic --yes
echo DONE
