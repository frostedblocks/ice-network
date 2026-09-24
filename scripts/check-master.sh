#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy
echo "=== getOwner ==="
dfx canister call ice getOwner --network ic --query
echo "=== isOwner zna7n ==="
dfx canister call ice isOwner '(principal "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae")' --network ic --query
echo "=== isRegistered zna7n ==="
dfx canister call ice isRegistered '(principal "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae")' --network ic --query
echo "=== isRegistered d7fkw ==="
dfx canister call ice isRegistered '(principal "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae")' --network ic --query
echo "=== isOwner d7fkw ==="
dfx canister call ice isOwner '(principal "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae")' --network ic --query
echo "=== profile zna7n ==="
dfx canister call ice getProfile '(principal "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae")' --network ic --query
echo "=== profile d7fkw ==="
dfx canister call ice getProfile '(principal "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae")' --network ic --query
