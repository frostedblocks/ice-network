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

echo "=== Deploy ICE (join fee split → factory 2.7 + DFX surplus) ==="
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

echo "=== Deploy factory (auto 2.7 ICP → cycles on mint) ==="
cd "$PROJ_ICE"
cp -f "$WIN_ICE/src/factory/main.mo" src/factory/main.mo
cp -f "$WIN_ICE/canister_ids.json" canister_ids.json
dfx deploy factory --network ic --yes

echo "=== Balances ==="
dfx ledger balance --of-principal 6jf55-2qaaa-aaaan-q6mwq-cai --network ic
dfx ledger balance --of-principal xfwx3-7yaaa-aaaas-qgxpq-cai --network ic
dfx ledger balance --network ic
dfx canister call factory health --network ic --query
dfx canister call 6jf55-2qaaa-aaaan-q6mwq-cai getRegistrationFeeE8s --network ic --query

echo DONE
