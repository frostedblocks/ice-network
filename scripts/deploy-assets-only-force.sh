#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy
cd /home/walt_wood1/ScaleSpace
# touch to force asset sync if needed
date >> frontend/dist/.deploy-stamp
dfx deploy assets --network ic --yes
echo DONE
