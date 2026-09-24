#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:/home/walt_wood1/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

WIN="/mnt/c/Users/walt_/ScaleSpace"
ICE_NET_WIN="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ScaleSpace"
ICE_NET="/home/walt_wood1/ice-network"

cd "$PROJ"
dfx identity use mynewdeploy

cat > canister_ids.json <<'EOF'
{
  "assets": { "ic": "6hhqv-baaaa-aaaan-q6mxq-cai" },
  "ice": { "ic": "6jf55-2qaaa-aaaan-q6mwq-cai" },
  "messaging": { "ic": "6agwb-myaaa-aaaan-q6mxa-cai" }
}
EOF

cp -f "$WIN/backend/main.mo" backend/main.mo
cp -f "$WIN/frontend/src/"*.jsx frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.js frontend/src/ 2>/dev/null || true
cp -rf "$WIN/frontend/src/declarations" frontend/src/ 2>/dev/null || true

echo "=== deploy ice ==="
dfx deploy ice --network ic --yes

echo "=== ensure 5 ICP registration fee ==="
dfx canister call ice ensureRegistrationFee5Icp --network ic
dfx canister call ice getRegistrationFeeE8s --network ic
dfx canister call ice isRegistrationFeeEnabled --network ic

echo "=== user_site getCanisterId ==="
cp -f "$ICE_NET_WIN/src/user_site/main.mo" "$ICE_NET/src/user_site/main.mo"
cd "$ICE_NET"
dfx build user_site --network ic
dfx canister install user_site --network ic --mode upgrade --yes || \
  dfx canister install user_site --network ic --mode reinstall --yes --argument '(principal "aaaaa-aa")' || true
# upgrade personal site
dfx canister install sxpaw-paaaa-aaaas-qgxra-cai --network ic --mode upgrade \
  --wasm .dfx/ic/canisters/user_site/user_site.wasm --yes 2>/dev/null || echo "sxpaw upgrade optional"

cd "$PROJ"
echo "=== frontend assets ==="
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
echo "App: https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/"
echo "My Site tab shows personal canister ID"
echo "First login fee: 5 ICP"
