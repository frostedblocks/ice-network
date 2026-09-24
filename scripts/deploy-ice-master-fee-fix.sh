#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20

WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
cd "$PROJ"
dfx identity use mynewdeploy

echo "=== Sync backend + frontend ==="
cp -f "$WIN/backend/main.mo" backend/main.mo
cp -f "$WIN/frontend/src/MasterEconomyControls.jsx" frontend/src/MasterEconomyControls.jsx
cp -f "$WIN/frontend/src/declarations/ice/ice.did.js" frontend/src/declarations/ice/ice.did.js

echo "=== Deploy ice ==="
dfx deploy ice --network ic --yes

echo "=== Verify isOwner for trusted masters ==="
for P in \
  "4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe" \
  "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae" \
  "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae" \
  "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae"
do
  echo -n "$P -> "
  dfx canister call ice isOwner "(principal \"$P\")" --network ic
done

echo "=== getOwner / getEconomyConfig ==="
dfx canister call ice getOwner --network ic
dfx canister call ice getEconomyConfig --network ic

echo "=== Deploy assets ==="
bash /mnt/c/Users/walt_/ScaleSpace/scripts/deploy-assets-only.sh

echo DONE
