#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
cd /home/walt_wood1/ice-network

# Sync factory + deploy
cp -f /mnt/c/Users/walt_/ice-network/src/factory/main.mo src/factory/main.mo
dfx deploy factory --network ic --yes

DFX="vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe"
NNS="gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae"
FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"

# Sites where dfx is still a controller — force multi-controller list
# tgf6j: owner d7fkw
# scir3: owner zna7n
fix_site() {
  local SITE="$1"
  local USER="$2"
  echo "=== Fix controllers $SITE (user=$USER) ==="
  dfx canister update-settings "$SITE" --network ic --yes \
    --add-controller "$USER" \
    --add-controller "$NNS" \
    --add-controller "$DFX" \
    --add-controller "$FACTORY" 2>&1 || true
  # Prefer explicit set if supported
  dfx canister update-settings "$SITE" --network ic --yes \
    --set-controller "$USER" \
    --add-controller "$NNS" \
    --add-controller "$DFX" \
    --add-controller "$FACTORY" 2>&1 || \
  dfx canister update-settings "$SITE" --network ic --yes \
    --add-controller "$USER" \
    --add-controller "$NNS" \
    --add-controller "$DFX" \
    --add-controller "$FACTORY" 2>&1 || true
  dfx canister info "$SITE" --network ic 2>&1 | head -3
}

fix_site "tgf6j-xiaaa-aaaas-qgxuq-cai" "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae"
fix_site "scir3-oiaaa-aaaas-qgxsq-cai" "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae"

# Try factory applyStandardControllers for linked users
for USER in \
  "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae" \
  "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae" \
  "kzncb-ht5cl-o2gik-fey7v-atztx-yzkmf-x3c5c-tvpwh-da6ny-x6wmu-fae" \
  "4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe"
do
  echo "=== factory applyStandardControllers $USER ==="
  dfx canister call factory applyStandardControllers "(principal \"$USER\")" --network ic 2>&1 || true
done

echo "=== Final controller dump ==="
for C in tgf6j-xiaaa-aaaas-qgxuq-cai scir3-oiaaa-aaaas-qgxsq-cai sxpaw-paaaa-aaaas-qgxra-cai sll2h-yaaaa-aaaas-qgxta-cai; do
  echo "--- $C ---"
  dfx canister info "$C" --network ic 2>&1 | head -2
done

bash /mnt/c/Users/walt_/ScaleSpace/scripts/deploy-assets-only.sh
echo DONE
