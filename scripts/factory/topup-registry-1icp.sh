#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

REGISTRY="tihtb-myaaa-aaaas-qgxvq-cai"

dfx identity use mynewdeploy

echo "=== BEFORE ==="
echo "Principal: $(dfx identity get-principal)"
echo "Ledger ICP:"
dfx ledger balance --network ic
echo "Cycles wallet:"
dfx cycles balance --network ic
echo "Registry status:"
dfx canister --network ic status "$REGISTRY"

echo ""
echo "=== Top up registry with 1 ICP ==="
dfx ledger top-up --amount 1 --network ic "$REGISTRY"

echo ""
echo "=== AFTER ==="
echo "Ledger ICP:"
dfx ledger balance --network ic
echo "Cycles wallet:"
dfx cycles balance --network ic
echo "Registry status:"
dfx canister --network ic status "$REGISTRY"

echo DONE
