#!/bin/bash
set -euo pipefail
export PATH="$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
# nvm optional
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" && nvm use 20 >/dev/null 2>&1 || true

WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
cd "$PROJ"
dfx identity use mynewdeploy

echo "=== Sync backend ==="
cp -f "$WIN/backend/main.mo" backend/main.mo

echo "=== Deploy ice ==="
dfx deploy ice --network ic --yes

echo "=== Profiles BEFORE cleanup ==="
dfx canister call ice adminListProfiles --network ic --query || true
dfx canister call ice getSiteStats --network ic --query

ZNA="zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae"
echo "=== Delete legacy zna7n / FrostedBlocks profile ==="
dfx canister call ice adminDeleteProfile "(principal \"$ZNA\")" --network ic

# Unmark trusted/ops principals that are not real member accounts
for p in \
  "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae" \
  "4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe" \
  "vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe"
do
  echo "=== Unmark registered $p ==="
  dfx canister call ice adminUnmarkRegistered "(principal \"$p\")" --network ic || true
done

echo "=== Profiles AFTER cleanup ==="
dfx canister call ice adminListProfiles --network ic --query
dfx canister call ice getSiteStats --network ic --query

echo DONE
