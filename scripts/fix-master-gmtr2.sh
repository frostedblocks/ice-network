#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy

M="gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae"

echo "=== before ==="
dfx canister call ice getOwner --network ic --query
dfx canister call ice isOwner "(principal \"$M\")" --network ic --query
dfx canister call ice isRegistered "(principal \"$M\")" --network ic --query
dfx canister call ice getProfile "(principal \"$M\")" --network ic --query

# Owner on ice is zna7n; transfer requires isMaster. Deploy identity is vm63y - NOT ice master.
# Need to call as a trusted master. vm63y is factory owner but may not be ice master.
# TRUSTED has 4jitt, gmtr2, d7fkw, zna7n - not vm63y.
# So adminMarkRegistered and transferMasterProfile need a master identity.

echo "=== note: if Not authorized, call with founder II from candid UI ==="
echo "Owner is currently:"
dfx canister call ice getOwner --network ic --query

echo DONE
