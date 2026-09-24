#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

WIN="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ice-network"
cd "$PROJ"
dfx identity use mynewdeploy

echo "=== Sync + deploy factory (adminUpgradeUserSite) ==="
mkdir -p src/factory
cp -f "$WIN/src/factory/main.mo" src/factory/main.mo
cp -f "$WIN/dfx.json" dfx.json 2>/dev/null || true
cp -f "$WIN/canister_ids.json" canister_ids.json 2>/dev/null || true
dfx deploy factory --network ic --yes

echo "=== WASM size ==="
dfx canister call factory getWasmSize --network ic --query

echo "=== List sites ==="
dfx canister call factory listRegisteredSites --network ic --query

SITES=(
  "sll2h-yaaaa-aaaas-qgxta-cai"
  "sxpaw-paaaa-aaaas-qgxra-cai"
  "scir3-oiaaa-aaaas-qgxsq-cai"
)

for SITE in "${SITES[@]}"; do
  echo ""
  echo "=== Upgrade $SITE ==="
  dfx canister info "$SITE" --network ic 2>&1 | sed -n '1,5p' || true
  # Ensure factory is controller when we can (no-op / fails if not controller)
  dfx canister call factory adminSetControllers "(
    principal \"$SITE\",
    vec {
      principal \"gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae\";
      principal \"vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe\";
      principal \"xfwx3-7yaaa-aaaas-qgxpq-cai\";
    }
  )" --network ic 2>&1 || true

  dfx canister call factory adminUpgradeUserSite "(principal \"$SITE\")" --network ic 2>&1 || true

  echo "--- post module hash ---"
  dfx canister info "$SITE" --network ic 2>&1 | sed -n '1,4p' || true

  # Smoke: listPhotos should exist after photo WASM
  echo "--- listPhotos smoke ---"
  dfx canister call "$SITE" listPhotos --network ic --query 2>&1 || true
done

echo ""
echo DONE
