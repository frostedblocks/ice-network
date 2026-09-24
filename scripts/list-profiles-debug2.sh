#!/bin/bash
export PATH="$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ScaleSpace || exit 1
dfx identity use mynewdeploy >/dev/null 2>&1

echo "=== principal of dfx ==="
dfx identity get-principal

echo "=== isMaster / isOwner for caller ==="
P=$(dfx identity get-principal)
dfx canister call ice isOwner "(principal \"$P\")" --network ic --query

echo "=== adminSearchUsers common ==="
for q in Master FrostedBlocks test test2 ice user a e i o u m f t; do
  echo "--- search: $q ---"
  dfx canister call ice adminSearchUsers "(\"$q\", 50)" --network ic --query 2>&1 | head -80
done

echo "=== username lookups ==="
for u in Master FrostedBlocks test test2 Ice ice User admin; do
  echo "--- username $u ---"
  dfx canister call ice getPrincipalByUsername "(\"$u\")" --network ic --query 2>&1
done
