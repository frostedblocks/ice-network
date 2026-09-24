#!/bin/bash
# Replace video app on Master_Factory + User_Site with ICE social (ScaleSpace).
# Does NOT touch the original ice/messaging/assets canisters (6jf55 / 6agwb / 6hhqv).
set -euo pipefail
export PATH="/usr/bin:/bin:/home/walt_wood1/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
MASTER="xfwx3-7yaaa-aaaas-qgxpq-cai"      # Master_Factory → ICE backend
USER_SITE="sznn6-uqaaa-aaaas-qgxqa-cai"  # User_Site → ICE frontend
MSG="6agwb-myaaa-aaaan-q6mxa-cai"         # existing messaging (shared)

cd "$PROJ"
dfx identity use mynewdeploy

echo "=== sync sources from Windows ==="
cp -f "$WIN/backend/main.mo" backend/main.mo
cp -f "$WIN/messaging/main.mo" messaging/main.mo 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.jsx frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.js frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.css frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/vite.config.js" frontend/vite.config.js
cp -f "$WIN/frontend/public/"*.html frontend/public/ 2>/dev/null || true
cp -rf "$WIN/frontend/src/declarations" frontend/src/ 2>/dev/null || true

# Backup primary canister IDs (original live ICE)
cp -f canister_ids.json canister_ids.json.primary.bak 2>/dev/null || true
if [ ! -f canister_ids.json.primary.bak ]; then
  cat > canister_ids.json.primary.bak <<EOF
{
  "assets": { "ic": "6hhqv-baaaa-aaaan-q6mxq-cai" },
  "ice": { "ic": "6jf55-2qaaa-aaaan-q6mwq-cai" },
  "messaging": { "ic": "6agwb-myaaa-aaaan-q6mxa-cai" }
}
EOF
fi

# Point dfx ice/assets at Master_Factory / User_Site for this deploy only
cat > canister_ids.json <<EOF
{
  "ice": { "ic": "$MASTER" },
  "messaging": { "ic": "$MSG" },
  "assets": { "ic": "$USER_SITE" }
}
EOF

echo "=== install ICE backend onto Master_Factory ($MASTER) [reinstall — replaces video wasm] ==="
# reinstall required: previous wasm was FrostedBlocks (incompatible upgrade)
dfx build ice --network ic
dfx canister install ice --network ic --mode reinstall --yes \
  --wasm .dfx/ic/canisters/ice/ice.wasm

echo "=== refresh IDL ==="
mkdir -p frontend/src/declarations/ice
cp -f .dfx/ic/canisters/ice/service.did.js frontend/src/declarations/ice/ice.did.js
cp -f .dfx/ic/canisters/ice/service.did frontend/src/declarations/ice/ice.did
cp -f .dfx/ic/canisters/ice/service.did.d.ts frontend/src/declarations/ice/ice.did.d.ts 2>/dev/null || true
cp -f frontend/src/declarations/ice/* "$WIN/frontend/src/declarations/ice/" 2>/dev/null || true

echo "=== build ICE frontend → Master_Factory + shared messaging ==="
cd frontend
DFX_NETWORK=ic \
CANISTER_ID_ICE="$MASTER" \
CANISTER_ID_MESSAGING="$MSG" \
npm run build
cp -f public/*.html dist/ 2>/dev/null || true
cp -f .ic-assets.json dist/.ic-assets.json 2>/dev/null || true
mkdir -p dist/.well-known
cp -f public/.well-known/ic-domains dist/.well-known/ 2>/dev/null || true
cd ..

echo "=== install ICE UI onto User_Site ($USER_SITE) ==="
dfx deploy assets --network ic --yes

echo "=== restore primary canister_ids (original ICE network) ==="
cp -f canister_ids.json.primary.bak canister_ids.json

echo "=== status Master_Factory / User_Site ==="
dfx canister status "$MASTER" --network ic
dfx canister status "$USER_SITE" --network ic

# Notes for Windows
cat > "$WIN/MASTER_USER_SITE.md" <<EOF
# Master_Factory + User_Site = ICE social (not video)

| Display name   | ID | Role |
|----------------|----|------|
| Master Factory | \`$MASTER\` | ICE backend (posts, tokens, follows, etc.) |
| User_Site      | \`$USER_SITE\` | ICE frontend UI |
| messaging (shared) | \`$MSG\` | DMs (existing canister) |

## App URL
https://$USER_SITE.icp0.io/

## Original ICE network (unchanged)
- ice: 6jf55-2qaaa-aaaan-q6mwq-cai
- messaging: 6agwb-myaaa-aaaan-q6mxa-cai
- assets: 6hhqv-baaaa-aaaan-q6mxq-cai → https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/
EOF

echo ""
echo "========================================"
echo "ICE social on User_Site:"
echo "  https://$USER_SITE.icp0.io/"
echo "Master_Factory backend:"
echo "  $MASTER"
echo "Original ICE assets still at:"
echo "  https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/"
echo "========================================"
echo "DONE"
