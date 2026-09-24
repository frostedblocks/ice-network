#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"

WIN="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ice-network"
cd "$PROJ"

echo "=== Sync factory source ==="
cp -f "$WIN/src/factory/main.mo" src/factory/main.mo

echo "=== Cycles top-up if needed ==="
BAL=$(dfx canister --network ic status factory 2>&1 | awk '/Balance:/{print $2}' | tr -d '_')
echo "factory cycles: $BAL"
# Need ~4T for a few recreates; if under 4T, convert ICP
if [ "${BAL:-0}" -lt 4000000000000 ] 2>/dev/null; then
  echo "Converting 3 ICP -> cycles and topping factory..."
  dfx cycles convert --amount 3 --network ic || true
  dfx cycles top-up xfwx3-7yaaa-aaaas-qgxpq-cai 4000000000000 --network ic || \
    dfx cycles top-up xfwx3-7yaaa-aaaas-qgxpq-cai 2500000000000 --network ic || true
fi

echo "=== Deploy factory ==="
dfx deploy factory --network ic --yes

echo "=== Recreate sites with multi-controllers ==="
# Test users that already paid registration
for USER in \
  "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae" \
  "kzncb-ht5cl-o2gik-fey7v-atztx-yzkmf-x3c5c-tvpwh-da6ny-x6wmu-fae" \
  "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae" \
  "4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe"
do
  echo "--- adminRecreateUserSite $USER ---"
  dfx canister call factory adminRecreateUserSite "(principal \"$USER\")" --network ic 2>&1 || true
done

echo "=== Verify mappings + controllers ==="
for USER in \
  "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae" \
  "kzncb-ht5cl-o2gik-fey7v-atztx-yzkmf-x3c5c-tvpwh-da6ny-x6wmu-fae" \
  "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae" \
  "4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe"
do
  echo "map $USER:"
  SITE=$(dfx canister call factory getUserCanister "(principal \"$USER\")" --network ic)
  echo "  $SITE"
  SID=$(echo "$SITE" | grep -oE '[a-z0-9]{5}-[a-z0-9-]+-cai' | head -1 || true)
  if [ -n "$SID" ]; then
    dfx canister info "$SID" --network ic 2>&1 | head -3
  fi
done

echo DONE
