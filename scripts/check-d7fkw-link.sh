#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
cd /home/walt_wood1/ice-network
dfx identity use mynewdeploy
USER="d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae"
SITE="sll2h-yaaaa-aaaas-qgxta-cai"
echo "=== getUserCanister ==="
dfx canister call factory getUserCanister "(principal \"$USER\")" --network ic --query
echo "=== getLastSite ==="
dfx canister call factory getLastSite "(principal \"$USER\")" --network ic --query
echo "=== getSiteOwner sll2h ==="
dfx canister call factory getSiteOwner "(principal \"$SITE\")" --network ic --query
echo "=== listActive ==="
dfx canister call factory listActiveCanisters --network ic --query
echo "=== controllers sll2h ==="
dfx canister info "$SITE" --network ic || true
