#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ScaleSpace
dfx identity use anonymous 2>/dev/null || dfx identity new anonymous --storage-mode plaintext
dfx identity use anonymous
dfx canister call ice contactMaster '("Landing guest", "Hello master from public form test")' --network ic
echo DONE
