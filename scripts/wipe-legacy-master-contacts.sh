#!/bin/bash
# Deploy ICE wipeAllMasterContacts and clear all legacy contact notes + guest chats.
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
mkdir -p frontend/src/declarations/ice
cp -f "$WIN/frontend/src/declarations/ice/"* frontend/src/declarations/ice/ 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.jsx frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.js frontend/src/ 2>/dev/null || true

echo "=== Deploy ICE ==="
dfx deploy ice --network ic --yes

echo "=== wipeAllMasterContacts ==="
dfx canister call ice wipeAllMasterContacts --network ic

echo "=== getMasterContacts (expect empty) ==="
dfx canister call ice getMasterContacts '(50)' --network ic

echo "=== wipeAllGuestChats ==="
dfx canister call messaging wipeAllGuestChats --network ic || true

echo "=== listOpenGuestThreads ==="
dfx canister call messaging listOpenGuestThreads --network ic

echo "=== Build + deploy assets (MasterContacts Delete all button) ==="
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
cd ..
dfx deploy assets --network ic --yes
echo DONE
