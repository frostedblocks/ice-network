#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
cd /home/walt_wood1/ice-network

USER="d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae"

echo "=== factory map for d7fkw ==="
dfx canister call factory getUserCanister "(principal \"$USER\")" --network ic

echo "=== listActiveCanisters ==="
dfx canister call factory listActiveCanisters --network ic

echo "=== tgf6j status/info ==="
dfx canister info tgf6j-xiaaa-aaaas-qgxuq-cai --network ic 2>&1 || true
dfx canister --network ic status tgf6j-xiaaa-aaaas-qgxuq-cai 2>&1 | head -20 || true

echo "=== tgf6j getOwner / health if any ==="
dfx canister call tgf6j-xiaaa-aaaas-qgxuq-cai getOwner --network ic 2>&1 || true
dfx canister call tgf6j-xiaaa-aaaas-qgxuq-cai getCyclesGauge --network ic 2>&1 || true
dfx canister call tgf6j-xiaaa-aaaas-qgxuq-cai getLocalFeed "(30)" --network ic 2>&1 || true

echo "=== factory health/cycles ==="
dfx canister call factory health --network ic 2>&1
dfx canister --network ic status factory 2>&1 | grep Balance || true

echo "=== old sxpaw (master legacy) ==="
dfx canister info sxpaw-paaaa-aaaas-qgxra-cai --network ic 2>&1 | head -5 || true
