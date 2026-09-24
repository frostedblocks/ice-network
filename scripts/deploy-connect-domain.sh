#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

dfx identity use mynewdeploy

echo "=== Deploy factory ==="
cd /home/walt_wood1/ice-network
cp -f /mnt/c/Users/walt_/ice-network/src/factory/main.mo src/factory/main.mo
dfx deploy factory --network ic --yes

echo "=== Deploy assets frontend ==="
cd /home/walt_wood1/ScaleSpace
cp -f /mnt/c/Users/walt_/ScaleSpace/frontend/src/SiteDomainDns.jsx frontend/src/SiteDomainDns.jsx
cp -f /mnt/c/Users/walt_/ScaleSpace/frontend/src/MySite.jsx frontend/src/MySite.jsx
cp -f /mnt/c/Users/walt_/ScaleSpace/frontend/src/declarations/factory/factory.did.js frontend/src/declarations/factory/factory.did.js
bash /mnt/c/Users/walt_/ScaleSpace/scripts/deploy-assets-photos.sh

echo "=== Fees ==="
dfx canister call factory getFees --network ic --query
echo DONE
