#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:/home/walt_wood1/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ice-network
dfx identity use mynewdeploy
PRINCIPAL=$(dfx identity get-principal)
FACTORY=xfwx3-7yaaa-aaaas-qgxpq-cai
echo "principal=$PRINCIPAL"

echo "=== wallet cycles ==="
dfx cycles balance --network ic

echo "=== top-up factory with 1.5T cycles from cycles ledger ==="
dfx cycles top-up "$FACTORY" 1500000000000 --network ic

echo "=== factory cycles ==="
dfx canister call factory getFactoryCycles --network ic
dfx canister call factory getWasmMagicHex --network ic
dfx canister call factory getWasmSize --network ic

echo "=== createUserSite ==="
dfx canister call factory createUserSite --network ic

echo "=== lookup ==="
dfx canister call factory getUserCanister "(principal \"$PRINCIPAL\")" --network ic
dfx canister call factory listActiveCanisters --network ic
dfx canister call factory health --network ic
echo DONE
