#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
cd /home/walt_wood1/ice-network

FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"

echo "=== BEFORE ==="
echo -n "dfx ICP: "; dfx ledger --network ic balance
echo -n "cycles ledger: "; dfx cycles balance --network ic
dfx canister --network ic status factory 2>&1 | grep -E "Balance:|Status:"

echo ""
echo "=== Convert 2 ICP -> cycles ==="
dfx cycles convert --amount 2 --network ic

echo ""
echo "=== Top-up factory 2.5T cycles ==="
dfx cycles top-up "$FACTORY" 2500000000000 --network ic

echo ""
echo "=== AFTER ==="
echo -n "dfx ICP: "; dfx ledger --network ic balance
echo -n "cycles ledger: "; dfx cycles balance --network ic
dfx canister --network ic status factory 2>&1 | grep -E "Balance:|Status:"
dfx canister call factory health --network ic
echo DONE
