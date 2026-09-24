#!/bin/bash
# Deploy ICE Registry, upgrade Factory, wire factory↔registry, backfill mints.
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

WIN="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ice-network"

mkdir -p "$PROJ/src/factory" "$PROJ/src/user_site" "$PROJ/src/registry" "$PROJ/scripts"
cp -f "$WIN/dfx.json" "$PROJ/dfx.json"
cp -f "$WIN/canister_ids.json" "$PROJ/canister_ids.json" 2>/dev/null || true
cp -f "$WIN/src/factory/main.mo" "$PROJ/src/factory/main.mo"
cp -f "$WIN/src/user_site/main.mo" "$PROJ/src/user_site/main.mo"
cp -f "$WIN/src/registry/main.mo" "$PROJ/src/registry/main.mo"

cd "$PROJ"
dfx identity use mynewdeploy
echo "principal: $(dfx identity get-principal)"

FACTORY_ID="xfwx3-7yaaa-aaaas-qgxpq-cai"

echo "=== Create registry canister if missing (0.5T cycles) ==="
if ! grep -q '"registry"' canister_ids.json 2>/dev/null; then
  if [ ! -f canister_ids.json ]; then
    echo '{}' > canister_ids.json
  fi
  dfx canister create registry --network ic --with-cycles 500000000000
fi

echo "=== Deploy registry + upgrade factory ==="
dfx deploy registry --network ic --yes
dfx deploy factory --network ic --yes

REG_ID=$(dfx canister id registry --network ic)
echo "Registry: $REG_ID"
echo "Factory:  $FACTORY_ID"

# Persist registry id into canister_ids.json
python3 - <<PY
import json, pathlib
p = pathlib.Path("canister_ids.json")
data = json.loads(p.read_text()) if p.exists() else {}
data.setdefault("registry", {})["ic"] = "$REG_ID"
data.setdefault("factory", {})["ic"] = "$FACTORY_ID"
p.write_text(json.dumps(data, indent=2) + "\n")
print(data)
PY
cp -f canister_ids.json "$WIN/canister_ids.json"

echo "=== claim registry owner (if unclaimed) ==="
dfx canister call registry claimOwner --network ic || true

echo "=== authorize Factory as sole Registry writer ==="
dfx canister call registry setAuthorizedFactory "(principal \"$FACTORY_ID\")" --network ic

echo "=== point Factory at Registry ==="
dfx canister call factory adminSetRegistry "(principal \"$REG_ID\")" --network ic

echo "=== backfill existing mints into Registry ==="
dfx canister call factory adminBackfillRegistry --network ic

echo "=== smoke ==="
dfx canister call registry health --network ic --query
dfx canister call registry getAuthorizedFactory --network ic --query
dfx canister call factory getRegistryId --network ic --query
dfx canister call factory getFees --network ic --query

echo ""
echo "DONE"
echo "Registry: $REG_ID"
echo "Factory:  $FACTORY_ID"
