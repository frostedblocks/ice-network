#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:/home/walt_wood1/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

CTRL="${1:-gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae}"
PROJ="/home/walt_wood1/ScaleSpace"
cd "$PROJ"
dfx identity use mynewdeploy

echo "Controller to add: $CTRL"
echo "dfx principal: $(dfx identity get-principal)"
echo "cycles: $(dfx cycles balance --network ic 2>&1 || true)"

for c in ice messaging assets; do
  echo ""
  echo "==== BEFORE $c ===="
  id=$(dfx canister id "$c" --network ic)
  echo "id=$id"
  dfx canister info "$c" --network ic || true
done

for c in ice messaging assets; do
  echo ""
  echo "==== ADD CONTROLLER to $c ===="
  dfx canister update-settings "$c" --add-controller "$CTRL" --network ic
done

for c in ice messaging assets; do
  echo ""
  echo "==== AFTER $c ===="
  dfx canister info "$c" --network ic || true
done

echo "DONE"
