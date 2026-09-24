#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

WIN="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ice-network"
cd "$PROJ"
dfx identity use mynewdeploy

mkdir -p src/factory src/registry
cp -f "$WIN/dfx.json" dfx.json
cp -f "$WIN/canister_ids.json" canister_ids.json 2>/dev/null || true
cp -f "$WIN/src/factory/main.mo" src/factory/main.mo
cp -f "$WIN/src/registry/main.mo" src/registry/main.mo

echo "=== Upgrade factory ==="
dfx deploy factory --network ic --yes

echo "=== Upgrade registry ==="
dfx deploy registry --network ic --yes || {
  echo "Registry deploy failed — top up cycles and retry"
  dfx cycles top-up tihtb-myaaa-aaaas-qgxvq-cai 100000000000 --network ic || true
  dfx deploy registry --network ic --yes
}

echo "=== smoke ==="
dfx canister call factory health --network ic --query
dfx canister call factory listRegisteredSites --network ic --query
dfx canister call registry health --network ic --query

echo DONE
