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
REGISTRY="tihtb-myaaa-aaaas-qgxvq-cai"
ICE="6jf55-2qaaa-aaaan-q6mwq-cai"

echo "=== Registry status ==="
dfx canister call "$REGISTRY" status --network ic --query 2>/dev/null || dfx canister call "$REGISTRY" getStatus --network ic --query 2>/dev/null || true
dfx canister status "$REGISTRY" --network ic 2>&1 | head -20

echo ""
echo "=== Factory getAllUserSites / list ==="
dfx canister call "$FACTORY" getAllUserSites --network ic --query 2>/dev/null || \
dfx canister call "$FACTORY" listUserSites --network ic --query 2>/dev/null || true

echo ""
echo "=== Sample getUserCanister for known owners ==="
for P in \
  "ogsk6-lwnep-oa422-nqvac-puciz-6fbaw-emuqb-xi6ay-ga75u-3e5rh-jae" \
  "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae" \
  "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae" \
  "aaaaa-aa"
do
  echo "--- $P ---"
  dfx canister call "$FACTORY" getUserCanister "(principal \"$P\")" --network ic --query
done

echo ""
echo "=== ICE registered user count / site stats ==="
dfx canister call "$ICE" getSiteStats --network ic --query 2>/dev/null | head -40
