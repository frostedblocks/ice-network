#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy

# After deploy, vm63y is trusted master for recovery
M="gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae"

echo "=== transferMasterProfile -> gmtr2 ==="
dfx canister call ice transferMasterProfile "(principal \"$M\")" --network ic

echo "=== adminMarkRegistered gmtr2 ==="
dfx canister call ice adminMarkRegistered "(principal \"$M\", \"FrostedBlocks\", \"Creating ICE — a quieter place for real conversation.\")" --network ic

echo "=== verify ==="
dfx canister call ice getOwner --network ic --query
dfx canister call ice isOwner "(principal \"$M\")" --network ic --query
dfx canister call ice isRegistered "(principal \"$M\")" --network ic --query
dfx canister call ice getProfile "(principal \"$M\")" --network ic --query
echo DONE
