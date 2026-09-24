#!/bin/bash
export PATH="$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ScaleSpace || cd "$(dirname "$0")/.." || exit 1
dfx identity use mynewdeploy >/dev/null 2>&1

echo "=== getSiteStats ==="
dfx canister call ice getSiteStats --network ic --query

for p in \
  "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae" \
  "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae" \
  "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae" \
  "4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe" \
  "vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe" \
  "kzncb-ht5cl-o2gik-fey7v-atztx-yzkmf-x3c5c-tvpwh-da6ny-x6wmu-fae"
do
  echo "=== PROFILE $p ==="
  dfx canister call ice getProfile "(principal \"$p\")" --network ic --query
  echo "=== REG $p ==="
  dfx canister call ice isRegistered "(principal \"$p\")" --network ic --query
done

# Also try owner
echo "=== getOwner ==="
dfx canister call ice getOwner --network ic --query
