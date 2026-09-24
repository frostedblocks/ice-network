#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy

echo "=== Factory listRegisteredSites ==="
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai listRegisteredSites --network ic --query

echo "=== Pending mints ==="
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai listPendingMints --network ic --query

echo "=== Registry mint count ==="
dfx canister call tihtb-myaaa-aaaas-qgxvq-cai getMintCount --network ic --query

echo "=== Registry listMintedCanisters ==="
dfx canister call tihtb-myaaa-aaaas-qgxvq-cai listMintedCanisters '(100 : nat)' --network ic --query

echo "=== ICE getRegistrationFee / payments stats ==="
dfx canister call 6jf55-2qaaa-aaaan-q6mwq-cai getTreasuryStats --network ic --query 2>&1 || true

echo DONE
