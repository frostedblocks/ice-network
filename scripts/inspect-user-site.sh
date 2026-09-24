#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
cd /home/walt_wood1/ice-network

USER="d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae"
MASTER="4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe"
DFX="vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe"
GMTR="gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae"

echo "=== factory mapping for d7fkw ==="
dfx canister call factory getUserCanister "(principal \"$USER\")" --network ic

echo "=== factory mapping for 4jitt ==="
dfx canister call factory getUserCanister "(principal \"$MASTER\")" --network ic

echo "=== listActiveCanisters ==="
dfx canister call factory listActiveCanisters --network ic

echo "=== sxpaw (known master site) info ==="
dfx canister info sxpaw-paaaa-aaaas-qgxra-cai --network ic 2>&1 || true

# If we got a site principal, inspect it — try common pattern
SITE=$(dfx canister call factory getUserCanister "(principal \"$USER\")" --network ic 2>/dev/null | tr -d '() \n"' | sed 's/optprincipal//g;s/null//g')
echo "parsed site raw: $SITE"
if [ -n "$SITE" ] && [ "$SITE" != "null" ]; then
  # extract principal text if present
  SITE_ID=$(echo "$SITE" | grep -oE '[a-z0-9]{5}-[a-z0-9-]+' | head -1 || true)
  echo "site id: $SITE_ID"
  if [ -n "$SITE_ID" ]; then
    dfx canister info "$SITE_ID" --network ic 2>&1 || true
  fi
fi
