#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy

FUG="fug2a-haaaa-aaaas-qgyaa-cai"
TPK="tpk5h-7ir2j-nenrh-qmzcy-rqlxp-3fitp-bbtgd-bwggx-352ke-6d5pt-pqe"
FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"
REG="tihtb-myaaa-aaaas-qgxvq-cai"

echo "=== BEFORE ==="
dfx canister call "$FACTORY" listPendingMints --network ic --query
dfx canister --network ic status "$FACTORY" 2>&1 | grep Balance || true

echo "=== RESUME pending mint fug2a ==="
dfx canister call "$FACTORY" adminResumePendingMint "(principal \"$FUG\")" --network ic

echo "=== AFTER pending ==="
dfx canister call "$FACTORY" listPendingMints --network ic --query

echo "=== link check ==="
dfx canister call "$FACTORY" getUserCanister "(principal \"$TPK\")" --network ic --query
dfx canister call "$FACTORY" getSiteOwner "(principal \"$FUG\")" --network ic --query
dfx canister call "$FACTORY" isLinked "(principal \"$TPK\")" --network ic --query

echo "=== registry ==="
dfx canister call "$REG" isFactoryMinted "(principal \"$FUG\")" --network ic --query
dfx canister call "$REG" getMintCount --network ic --query
dfx canister call "$FACTORY" health --network ic --query

echo DONE
