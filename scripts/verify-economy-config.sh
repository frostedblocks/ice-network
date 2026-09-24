#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"
dfx identity use mynewdeploy >/dev/null

ICE="6jf55-2qaaa-aaaan-q6mwq-cai"

echo "identity: $(dfx identity get-principal)"
echo ""
echo "=== getEconomyConfig ==="
dfx canister call "$ICE" getEconomyConfig --network ic --query
echo ""
echo "=== adminSetActionFees no-op (all off / 0) ==="
dfx canister call "$ICE" adminSetActionFees "(false, 0:nat, false, 0:nat, false, 0:nat)" --network ic
echo ""
echo "=== adminSetTipUnlockMinE8s no-op (0.01 ICP) ==="
dfx canister call "$ICE" adminSetTipUnlockMinE8s "(1_000_000:nat)" --network ic
echo ""
echo "=== adminSetRegistrationFee keep current 10 ICP ON ==="
dfx canister call "$ICE" adminSetRegistrationFee "(true, 1_000_000_000:nat, 0:nat)" --network ic
echo ""
echo "=== re-read getEconomyConfig ==="
dfx canister call "$ICE" getEconomyConfig --network ic --query
echo ""
echo "DONE"
