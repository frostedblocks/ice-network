#!/bin/bash
set -uo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ice-network
dfx identity use mynewdeploy

echo "=== Force upgrade sll2h ==="
dfx canister call factory adminUpgradeUserSite '(principal "sll2h-yaaaa-aaaas-qgxta-cai")' --network ic
dfx canister call sll2h-yaaaa-aaaas-qgxta-cai getPhotoQuota --network ic --query
dfx canister call sll2h-yaaaa-aaaas-qgxta-cai getOwner --network ic --query

echo "=== Top up scir3 (0.3 ICP) then upgrade ==="
dfx ledger top-up --amount 0.3 --network ic scir3-oiaaa-aaaas-qgxsq-cai || true
dfx canister call factory adminUpgradeUserSite '(principal "scir3-oiaaa-aaaas-qgxsq-cai")' --network ic || true
dfx canister call scir3-oiaaa-aaaas-qgxsq-cai getPhotoQuota --network ic --query || true
dfx canister call scir3-oiaaa-aaaas-qgxsq-cai listPhotos --network ic --query || true

echo "=== sxpaw (fail safe) ==="
dfx canister call factory adminUpgradeUserSite '(principal "sxpaw-paaaa-aaaas-qgxra-cai")' --network ic || true
dfx canister info sxpaw-paaaa-aaaas-qgxra-cai --network ic || true
echo DONE
