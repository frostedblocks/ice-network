#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:/home/walt_wood1/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
SITE="${1:-sxpaw-paaaa-aaaas-qgxra-cai}"
dfx identity use mynewdeploy
echo "=== status $SITE ==="
dfx canister status "$SITE" --network ic
echo "=== getOwner ==="
dfx canister call "$SITE" getOwner --network ic
echo "=== getLocalFeed ==="
dfx canister call "$SITE" getLocalFeed '(5 : nat)' --network ic
echo "=== getCyclesGauge ==="
dfx canister call "$SITE" getCyclesGauge --network ic
echo "=== makeLocalPost ==="
dfx canister call "$SITE" makeLocalPost '("Hello from provisioned User_Site", null)' --network ic
echo "=== getLocalFeed again ==="
dfx canister call "$SITE" getLocalFeed '(5 : nat)' --network ic
echo DONE
