#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy
FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"
echo "BEFORE dfx:"; dfx ledger balance --network ic
echo "BEFORE factory:"; dfx canister --network ic status "$FACTORY" 2>&1 | grep Balance
# convert almost all liquid dfx ICP (leave dust for fees)
dfx cycles convert --amount 0.19 --network ic
dfx cycles top-up "$FACTORY" 1000000000000 --network ic || true
# dump remaining cycles ledger to factory if any
BAL=$(dfx cycles balance --network ic 2>/dev/null | awk '{print $1}' || echo 0)
echo "cycles ledger: $BAL"
# top up with whatever is left (in TC, convert roughly)
dfx cycles top-up "$FACTORY" --all --network ic 2>/dev/null || \
  dfx cycles top-up "$FACTORY" 500000000000 --network ic 2>/dev/null || true
echo "AFTER dfx:"; dfx ledger balance --network ic
echo "AFTER cycles ledger:"; dfx cycles balance --network ic
echo "AFTER factory:"; dfx canister --network ic status "$FACTORY" 2>&1 | grep Balance
echo DONE
