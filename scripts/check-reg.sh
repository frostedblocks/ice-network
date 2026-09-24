#!/bin/bash
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"

for P in \
  "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae" \
  "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae" \
  "kzncb-ht5cl-o2gik-fey7v-atztx-yzkmf-x3c5c-tvpwh-da6ny-x6wmu-fae" \
  "4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe"
do
  echo "=== $P ==="
  dfx canister call ice isRegistered "(principal \"$P\")" --network ic --candid /home/walt_wood1/ScaleSpace/.dfx/ic/canisters/ice/ice.did 2>/dev/null \
    || dfx canister call 6jf55-2qaaa-aaaan-q6mwq-cai isRegistered "(principal \"$P\")" --network ic 2>&1
done

echo "=== factory owner ==="
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai getOwner --network ic 2>&1
echo "=== dfx principal ==="
dfx identity get-principal
