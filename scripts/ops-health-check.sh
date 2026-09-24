#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy

FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"
REG="tihtb-myaaa-aaaas-qgxvq-cai"
ICE="6jf55-2qaaa-aaaan-q6mwq-cai"

echo "=== Factory health ==="
dfx canister call "$FACTORY" health --network ic --query
dfx canister --network ic status "$FACTORY" 2>&1 | grep -E "Balance:|Status:|Memory|Idle" || true

echo "=== Registry health ==="
dfx canister call "$REG" health --network ic --query
dfx canister --network ic status "$REG" 2>&1 | grep -E "Balance:|Status:" || true

echo "=== Pending mints ==="
dfx canister call "$FACTORY" listPendingMints --network ic --query

echo "=== Reconcile registry ==="
dfx canister call "$FACTORY" adminReconcileRegistry --network ic

echo "=== Network cycles health ==="
dfx canister call "$FACTORY" getNetworkCyclesHealth --network ic

echo "=== All sites ==="
dfx canister call "$FACTORY" listRegisteredSites --network ic --query

echo "=== ICE treasury / fee ==="
dfx ledger balance --of-principal "$ICE" --network ic
dfx ledger balance --of-principal "$FACTORY" --network ic
dfx canister call "$ICE" getRegistrationFeeE8s --network ic --query 2>&1 || true
dfx canister call "$ICE" getTreasuryStats --network ic --query 2>&1 || true

echo "=== Site controllers / status (best effort) ==="
for s in sll2h-yaaaa-aaaas-qgxta-cai sxpaw-paaaa-aaaas-qgxra-cai scir3-oiaaa-aaaas-qgxsq-cai qeqdw-hyaaa-aaaas-qgx7q-cai fug2a-haaaa-aaaas-qgyaa-cai; do
  echo "--- $s ---"
  dfx canister call "$FACTORY" isFactoryControllerOf "(principal \"$s\")" --network ic 2>&1 || true
  dfx canister --network ic status "$s" 2>&1 | grep -E "Balance:|Status:|Controllers:" || true
done

echo "=== ICE / messaging / assets status ==="
for c in 6jf55-2qaaa-aaaan-q6mwq-cai 6agwb-myaaa-aaaan-q6mxa-cai 6hhqv-baaaa-aaaan-q6mxq-cai; do
  echo "--- $c ---"
  dfx canister --network ic status "$c" 2>&1 | grep -E "Balance:|Status:" || true
done

echo DONE
