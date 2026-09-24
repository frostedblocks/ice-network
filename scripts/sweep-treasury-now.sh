#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

WIN_SS="/mnt/c/Users/walt_/ScaleSpace"
PROJ_SS="/home/walt_wood1/ScaleSpace"
ICE="6jf55-2qaaa-aaaan-q6mwq-cai"
FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"

dfx identity use mynewdeploy

echo "=== BEFORE ==="
echo -n "ICE ICP: "; dfx ledger balance --of-principal "$ICE" --network ic
dfx canister --network ic status "$FACTORY" 2>&1 | grep -E "Balance:|Status:" || true

echo "=== Deploy ICE ==="
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

echo "=== Sweep (amount 0 = all liquid ICP) ==="
dfx canister call ice adminConvertTreasuryIcpToFactoryCycles '(0 : nat)' --network ic

echo "=== AFTER ==="
echo -n "ICE ICP: "; dfx ledger balance --of-principal "$ICE" --network ic
echo -n "FACTORY ICP: "; dfx ledger balance --of-principal "$FACTORY" --network ic
dfx canister --network ic status "$FACTORY" 2>&1 | grep -E "Balance:|Status:" || true
echo DONE
