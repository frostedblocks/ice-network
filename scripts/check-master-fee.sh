#!/bin/bash
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
cd /home/walt_wood1/ScaleSpace

echo "=== getEconomyConfig ==="
dfx canister call ice getEconomyConfig --network ic

echo "=== getOwner ==="
dfx canister call ice getOwner --network ic

echo "=== getRegistrationFeeE8s ==="
dfx canister call ice getRegistrationFeeE8s --network ic

echo "=== isRegistrationFeeEnabled ==="
dfx canister call ice isRegistrationFeeEnabled --network ic

for P in \
  "4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe" \
  "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae" \
  "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae" \
  "vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe"
do
  echo "isOwner $P:"
  dfx canister call ice isOwner "(principal \"$P\")" --network ic
done
