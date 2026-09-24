#!/bin/bash
set -uo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy
SITE="sxpaw-paaaa-aaaas-qgxra-cai"
OWNER="4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe"
FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"
NNS="gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae"
DFX="vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe"

echo "=== sxpaw BEFORE ==="
dfx canister info "$SITE" --network ic
echo "isFactoryControllerOf:"
dfx canister call factory isFactoryControllerOf "(principal \"$SITE\")" --network ic || true

echo "=== attempt adminSetControllers (fails safely if factory not controller) ==="
dfx canister call factory adminSetControllers "(
  principal \"$SITE\",
  vec {
    principal \"$OWNER\";
    principal \"$NNS\";
    principal \"$DFX\";
    principal \"$FACTORY\";
  }
)" --network ic || echo "FAIL_SAFE: adminSetControllers failed"

echo "=== attempt upgrade ==="
dfx canister call factory adminUpgradeUserSite "(principal \"$SITE\")" --network ic || echo "FAIL_SAFE: upgrade failed"

echo "=== attempt owner sync ==="
dfx canister call factory adminSyncSiteOwner "(principal \"$SITE\")" --network ic || echo "FAIL_SAFE: syncOwner failed"

echo "=== sxpaw AFTER ==="
dfx canister info "$SITE" --network ic
dfx canister status "$SITE" --network ic 2>&1 | sed -n '1,20p' || true
dfx canister call "$SITE" getOwner --network ic --query 2>&1 || true
dfx canister call "$SITE" getPhotoQuota --network ic --query 2>&1 || true
echo DONE
