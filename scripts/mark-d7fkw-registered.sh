#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy
USER="d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae"
echo "=== isRegistered before ==="
dfx canister call ice isRegistered "(principal \"$USER\")" --network ic --query
echo "=== adminMarkRegistered (no fee) ==="
# empty username keeps existing profile if any
dfx canister call ice adminMarkRegistered "(principal \"$USER\", \"\", \"\")" --network ic
echo "=== isRegistered after ==="
dfx canister call ice isRegistered "(principal \"$USER\")" --network ic --query
dfx canister call ice getProfile "(principal \"$USER\")" --network ic --query
echo DONE
