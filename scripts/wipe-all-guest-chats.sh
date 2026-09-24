#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy
echo "=== wipeAllGuestChats ==="
dfx canister call messaging wipeAllGuestChats --network ic
echo "=== listOpenGuestThreads (expect empty) ==="
dfx canister call messaging listOpenGuestThreads --network ic
echo DONE
