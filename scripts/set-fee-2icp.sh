#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:/home/walt_wood1/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
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
cp -f "$WIN/frontend/src/Register.jsx" frontend/src/Register.jsx

echo "=== deploy ice ==="
dfx deploy ice --network ic --yes

echo "=== set fee to 2 ICP ==="
dfx canister call ice ensureRegistrationFee2Icp --network ic
dfx canister call ice getRegistrationFeeE8s --network ic
dfx canister call ice isRegistrationFeeEnabled --network ic

ICE=$(dfx canister id ice --network ic)
MSG=$(dfx canister id messaging --network ic)
cd frontend
DFX_NETWORK=ic CANISTER_ID_ICE="$ICE" CANISTER_ID_MESSAGING="$MSG" \
  VITE_CANISTER_ID_FACTORY=xfwx3-7yaaa-aaaas-qgxpq-cai \
  npm run build
cp -f public/*.html dist/ 2>/dev/null || true
cp -f .ic-assets.json dist/ 2>/dev/null || true
mkdir -p dist/.well-known
cp -f public/.well-known/ic-domains dist/.well-known/ 2>/dev/null || true
cd ..
dfx deploy assets --network ic --yes
echo DONE — registration fee is 2 ICP
