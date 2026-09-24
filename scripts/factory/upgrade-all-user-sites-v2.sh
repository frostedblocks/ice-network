#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

WIN="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ice-network"
cd "$PROJ"
dfx identity use mynewdeploy

echo "=== Deploy factory with EOP upgrade fix ==="
cp -f "$WIN/src/factory/main.mo" src/factory/main.mo
dfx deploy factory --network ic --yes

echo "=== Restore controllers (include owners) ==="
dfx canister call factory adminSetControllers '(
  principal "sll2h-yaaaa-aaaas-qgxta-cai",
  vec {
    principal "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae";
    principal "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae";
    principal "kzncb-ht5cl-o2gik-fey7v-atztx-yzkmf-x3c5c-tvpwh-da6ny-x6wmu-fae";
    principal "vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe";
    principal "xfwx3-7yaaa-aaaas-qgxpq-cai";
  }
)' --network ic

dfx canister call factory adminSetControllers '(
  principal "scir3-oiaaa-aaaas-qgxsq-cai",
  vec {
    principal "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae";
    principal "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae";
    principal "vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe";
    principal "xfwx3-7yaaa-aaaas-qgxpq-cai";
  }
)' --network ic

# sxpaw only has owner 4jitt — factory cannot set controllers; skip restore

echo "=== Upgrade sll2h ==="
dfx canister call factory adminUpgradeUserSite '(principal "sll2h-yaaaa-aaaas-qgxta-cai")' --network ic
dfx canister info sll2h-yaaaa-aaaas-qgxta-cai --network ic | sed -n '1,5p'
dfx canister call sll2h-yaaaa-aaaas-qgxta-cai listPhotos --network ic --query || true
dfx canister call sll2h-yaaaa-aaaas-qgxta-cai getPhotoQuota --network ic --query || true

echo "=== Upgrade scir3 ==="
dfx canister call factory adminUpgradeUserSite '(principal "scir3-oiaaa-aaaas-qgxsq-cai")' --network ic
dfx canister info scir3-oiaaa-aaaas-qgxsq-cai --network ic | sed -n '1,5p'
dfx canister call scir3-oiaaa-aaaas-qgxsq-cai listPhotos --network ic --query || true
dfx canister call scir3-oiaaa-aaaas-qgxsq-cai getPhotoQuota --network ic --query || true

echo "=== Upgrade sxpaw (may fail if factory not controller) ==="
dfx canister call factory adminUpgradeUserSite '(principal "sxpaw-paaaa-aaaas-qgxra-cai")' --network ic || true
dfx canister info sxpaw-paaaa-aaaas-qgxra-cai --network ic | sed -n '1,5p'
dfx canister call sxpaw-paaaa-aaaas-qgxra-cai listPhotos --network ic --query || true

echo DONE
