#!/bin/bash
set -euo pipefail
export PATH="/home/walt_wood1/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

NEW_CTRL="gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae"
PROJ="/home/walt_wood1/ScaleSpace"
cd "$PROJ"

dfx identity use mynewdeploy
echo "Acting as principal: $(dfx identity get-principal)"
echo "Adding controller: $NEW_CTRL"
echo

for c in ice messaging assets; do
  echo "=== $c (before) ==="
  dfx canister info "$c" --network ic 2>&1 | grep -i controller || true
  echo "Updating $c..."
  dfx canister update-settings "$c" --network ic --add-controller "$NEW_CTRL"
  echo "=== $c (after) ==="
  dfx canister info "$c" --network ic 2>&1 | grep -i controller || true
  echo
done

echo "DONE"
