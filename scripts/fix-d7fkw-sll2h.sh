#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
cd /home/walt_wood1/ice-network
dfx identity use mynewdeploy

USER="d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae"
OLD_OWNER="kzncb-ht5cl-o2gik-fey7v-atztx-yzkmf-x3c5c-tvpwh-da6ny-x6wmu-fae"
SITE="sll2h-yaaaa-aaaas-qgxta-cai"

echo "=== Unlink old factory owner of sll2h (kzncb) if linked ==="
dfx canister call factory adminUnlinkUserCanister "(principal \"$OLD_OWNER\")" --network ic || true

echo "=== Link d7fkw -> sll2h ==="
dfx canister call factory adminLinkUserCanister "(principal \"$USER\", principal \"$SITE\")" --network ic

echo "=== Verify ==="
dfx canister call factory getUserCanister "(principal \"$USER\")" --network ic --query
dfx canister call factory getSiteOwner "(principal \"$SITE\")" --network ic --query
dfx canister call factory listActiveCanisters --network ic --query
echo DONE
