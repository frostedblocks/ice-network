#!/bin/bash
set -euo pipefail
export PATH="$HOME/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy
dfx canister call ice isOwner '(principal "ogsk6-lwnep-oa422-nqvac-puciz-6fbaw-emuqb-xi6ay-ga75u-3e5rh-jae")' --network ic --query
dfx canister call ice isOwner '(principal "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae")' --network ic --query
