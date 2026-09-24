#!/bin/bash
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
cd /home/walt_wood1/ice-network

echo "=== fees ==="
dfx canister call factory getFees --network ic

echo "=== quote 0.5T ==="
dfx canister call factory quoteTopUpIcpE8s '(500_000_000_000 : nat)' --network ic

echo "=== quote 1T ==="
dfx canister call factory quoteTopUpIcpE8s '(1_000_000_000_000 : nat)' --network ic

echo "=== factory cycles ==="
dfx canister call factory getFactoryCycles --network ic
dfx canister --network ic status factory 2>&1 | grep -E 'Balance|Status'

echo "=== dfx ICP ==="
dfx ledger --network ic balance

echo "=== health ==="
dfx canister call factory health --network ic

echo "=== linked sites ==="
dfx canister call factory listActiveCanisters --network ic
