#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"
dfx identity use mynewdeploy >/dev/null

FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"
REG="tihtb-myaaa-aaaas-qgxvq-cai"
USER="vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe"
SITE="sznn6-uqaaa-aaaas-qgxqa-cai"

echo "=== factory getUserCanister(vm63y) ==="
dfx canister call "$FACTORY" getUserCanister "(principal \"$USER\")" --network ic --query

echo "=== factory getLastSite(vm63y) ==="
dfx canister call "$FACTORY" getLastSite "(principal \"$USER\")" --network ic --query

echo "=== factory getAllUserSites (if any) ==="
dfx canister call "$FACTORY" getAllUserSites --network ic --query 2>&1 | head -80 || true

echo "=== search candid methods mentioning site/list ==="
# dump linked list from earlier known method name variations
for m in listUserSites getLinkedSites getSites adminListSites getAllSites; do
  echo "-- try $m --"
  dfx canister call "$FACTORY" "$m" --network ic --query 2>&1 | head -5 || true
done

echo "=== canister status controllers for sznn6 ==="
dfx canister status "$SITE" --network ic 2>&1 | head -25 || true

echo "=== registry status string ==="
dfx canister call "$REG" status --network ic --query 2>&1 || \
dfx canister call "$REG" getStatus --network ic --query 2>&1 || true
