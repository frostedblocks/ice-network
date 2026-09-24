#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"

FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"

echo "=== BEFORE ==="
echo -n "dfx ICP: "; dfx ledger --network ic balance
echo -n "cycles ledger: "; dfx cycles balance --network ic
echo "factory:"
dfx canister --network ic status factory 2>&1 | grep -E "Balance:|Status:"

# Convert 3 ICP -> cycles (keeps ~5.5 ICP liquid on dfx for later / user funding)
echo ""
echo "=== Convert 3 ICP to cycles ==="
dfx cycles convert --amount 3 --network ic

echo ""
echo "=== Top-up factory with 2.5T cycles (if available) ==="
# Use most converted cycles for factory; leave a little in cycles ledger
AVAILABLE=$(dfx cycles balance --network ic | awk '{print $1}')
echo "cycles available: $AVAILABLE TC"
# Top up 2.5 trillion if we have enough; else dump most of balance
dfx cycles top-up "$FACTORY" 2500000000000 --network ic || \
  dfx cycles top-up "$FACTORY" 1500000000000 --network ic || \
  true

echo ""
echo "=== AFTER ==="
echo -n "dfx ICP: "; dfx ledger --network ic balance
echo -n "cycles ledger: "; dfx cycles balance --network ic
echo "factory:"
dfx canister --network ic status factory 2>&1 | grep -E "Balance:|Status:"
dfx canister call factory health --network ic
echo DONE
