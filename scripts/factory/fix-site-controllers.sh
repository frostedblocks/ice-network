#!/bin/bash
# Ensure personal site is controlled only by the user's II (not factory as co-controller).
set -euo pipefail
export PATH="/usr/bin:/bin:/home/walt_wood1/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

SITE="sxpaw-paaaa-aaaas-qgxra-cai"
II="4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe"
FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"
WIN="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ice-network"

cd "$PROJ"
cp -f "$WIN/src/factory/main.mo" src/factory/main.mo
cp -f "$WIN/canister_ids.json" canister_ids.json
dfx identity use mynewdeploy

echo "=== upgrade factory (II-only controller on new sites) ==="
dfx deploy factory --network ic --yes

echo "=== set personal site controllers to II only (unlink factory from site) ==="
dfx canister update-settings "$SITE" \
  --set-controller "$II" \
  --network ic

echo "=== factory index maps II -> personal site canister (not factory id) ==="
dfx canister call factory adminLinkUserCanister \
  "(principal \"$II\", principal \"$SITE\")" --network ic

echo "=== verify site ==="
dfx canister info "$SITE" --network ic
dfx canister call "$SITE" getOwner --network ic
dfx canister call factory getUserCanister "(principal \"$II\")" --network ic

# Deploy ICE UI (My Site shows only personal site id)
SS="/home/walt_wood1/ScaleSpace"
SSWIN="/mnt/c/Users/walt_/ScaleSpace"
export NVM_DIR="/home/walt_wood1/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"
cd "$SS"
cat > canister_ids.json <<'EOF'
{
  "assets": { "ic": "6hhqv-baaaa-aaaan-q6mxq-cai" },
  "ice": { "ic": "6jf55-2qaaa-aaaan-q6mwq-cai" },
  "messaging": { "ic": "6agwb-myaaa-aaaan-q6mxa-cai" }
}
EOF
cp -f "$SSWIN/frontend/src/"*.jsx frontend/src/ 2>/dev/null || true
cp -f "$SSWIN/frontend/src/"*.js frontend/src/ 2>/dev/null || true
cp -rf "$SSWIN/frontend/src/declarations" frontend/src/ 2>/dev/null || true
ICE=$(dfx canister id ice --network ic)
MSG=$(dfx canister id messaging --network ic)
cd frontend
DFX_NETWORK=ic CANISTER_ID_ICE="$ICE" CANISTER_ID_MESSAGING="$MSG" \
  VITE_CANISTER_ID_FACTORY=xfwx3-7yaaa-aaaas-qgxpq-cai \
  npm run build
cp -f public/*.html dist/ 2>/dev/null || true
cp -f .ic-assets.json dist/.ic-assets.json 2>/dev/null || true
mkdir -p dist/.well-known
cp -f public/.well-known/ic-domains dist/.well-known/ 2>/dev/null || true
cd ..
dfx deploy assets --network ic --yes
echo DONE
