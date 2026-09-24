#!/bin/bash
# Transfer User_Site ownership + controller to an Internet Identity principal.
set -euo pipefail
export PATH="/usr/bin:/bin:/home/walt_wood1/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

II_PRINCIPAL="${1:-4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe}"
SITE="${2:-sxpaw-paaaa-aaaas-qgxra-cai}"
FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"
WIN="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ice-network"

cd "$PROJ"
cp -f "$WIN/src/factory/main.mo" src/factory/main.mo
cp -f "$WIN/canister_ids.json" canister_ids.json

dfx identity use mynewdeploy
echo "II principal: $II_PRINCIPAL"
echo "Site:         $SITE"

echo "=== deploy factory (adminLinkUserCanister) ==="
dfx deploy factory --network ic --yes

echo "=== 1) Set on-canister owner to your II ==="
dfx canister call "$SITE" init "(principal \"$II_PRINCIPAL\")" --network ic

echo "=== 2) Add II as controller ==="
dfx canister update-settings "$SITE" --add-controller "$II_PRINCIPAL" --network ic

echo "=== 3) Link factory index: II -> site ==="
dfx canister call factory adminLinkUserCanister \
  "(principal \"$II_PRINCIPAL\", principal \"$SITE\")" --network ic

echo "=== 4) Verify ==="
echo "getOwner:"
dfx canister call "$SITE" getOwner --network ic
echo "getUserCanister(II):"
dfx canister call factory getUserCanister "(principal \"$II_PRINCIPAL\")" --network ic
echo "controllers:"
dfx canister info "$SITE" --network ic

echo ""
echo "========================================"
echo "Connected."
echo ""
echo "1. Open https://id.ai  (same identity as this principal)"
echo "2. Open Candid UI:"
echo "   https://a4gq6-oaaaa-aaaab-qaa4q-cai.raw.icp0.io/?id=$SITE"
echo "3. Login / Connect with Internet Identity"
echo "4. Call getOwner — should show:"
echo "   $II_PRINCIPAL"
echo "5. Call makeLocalPost to post as yourself"
echo "========================================"
echo DONE
