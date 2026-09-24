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

# --- factory upgrade (registration gate) ---
cd "$ICE_NET"
cp -f "$ICE_NET_WIN/src/factory/main.mo" src/factory/main.mo
cp -f "$ICE_NET_WIN/canister_ids.json" canister_ids.json
dfx identity use mynewdeploy
echo "=== deploy factory ==="
dfx deploy factory --network ic --yes
dfx canister call factory health --network ic || true

# --- ICE assets frontend ---
cd "$PROJ"
cat > canister_ids.json <<'EOF'
{
  "assets": { "ic": "6hhqv-baaaa-aaaan-q6mxq-cai" },
  "ice": { "ic": "6jf55-2qaaa-aaaan-q6mwq-cai" },
  "messaging": { "ic": "6agwb-myaaa-aaaan-q6mxa-cai" }
}
EOF
cp -f "$WIN/frontend/src/"*.jsx frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.js frontend/src/ 2>/dev/null || true
cp -rf "$WIN/frontend/src/declarations" frontend/src/ 2>/dev/null || true

# ensure fee still on
dfx canister call ice ensureRegistrationFee5Icp --network ic || true
dfx canister call ice getRegistrationFeeE8s --network ic
dfx canister call ice isRegistrationFeeEnabled --network ic

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
echo "Flow: II login -> pay 5 ICP register -> factory creates website canister -> My Site"
