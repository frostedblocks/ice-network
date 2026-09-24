#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
cd "$PROJ"
mkdir -p messaging
cp -f "$WIN/messaging/main.mo" messaging/main.mo
cp -f "$WIN/dfx.json" dfx.json 2>/dev/null || true

echo "=== build messaging (no deploy) ==="
dfx build messaging --network ic
echo BUILD_OK
