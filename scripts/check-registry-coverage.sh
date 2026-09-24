#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy

echo "=== Registry health ==="
dfx canister call tihtb-myaaa-aaaas-qgxvq-cai health --network ic --query 2>&1 || true

echo "=== Factory registry id ==="
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai getRegistryId --network ic --query 2>&1 || true

echo "=== Factory health / sites ==="
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai health --network ic --query 2>&1 || true

echo "=== Reconcile registry ==="
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai adminReconcileRegistry --network ic 2>&1 || true

echo "=== Registry list if any ==="
dfx canister call tihtb-myaaa-aaaas-qgxvq-cai listRecords --network ic --query 2>&1 || true
dfx canister call tihtb-myaaa-aaaas-qgxvq-cai getMintCount --network ic --query 2>&1 || true
dfx canister call tihtb-myaaa-aaaas-qgxvq-cai listMints --network ic --query 2>&1 || true

echo "=== ICE registered users sample ==="
dfx canister call 6jf55-2qaaa-aaaan-q6mwq-cai adminListProfiles --network ic --query 2>&1 | head -c 4000 || true
echo
echo DONE
