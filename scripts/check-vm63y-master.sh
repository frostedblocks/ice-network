#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy
echo "principal=$(dfx identity get-principal)"
dfx canister call ice isOwner '(principal "vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe")' --network ic --query
dfx canister call ice isOwner '(principal "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae")' --network ic --query
dfx canister call ice getOwner --network ic --query
