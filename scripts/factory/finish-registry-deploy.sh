#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

WIN="/mnt/c/Users/walt_/ice-network"
PROJ="/home/walt_wood1/ice-network"
cd "$PROJ"
dfx identity use mynewdeploy

mkdir -p src/registry src/factory
cp -f "$WIN/dfx.json" dfx.json
cp -f "$WIN/src/registry/main.mo" src/registry/main.mo
cp -f "$WIN/src/factory/main.mo" src/factory/main.mo

# Ensure canister id recorded (created as tihtb-…)
REG_KNOWN="tihtb-myaaa-aaaas-qgxvq-cai"
mkdir -p .dfx/ic
if [ ! -f .dfx/ic/canister_ids.json ]; then
  echo '{}' > .dfx/ic/canister_ids.json
fi
python3 - <<PY
import json, pathlib
for path in [pathlib.Path("canister_ids.json"), pathlib.Path(".dfx/ic/canister_ids.json")]:
    data = json.loads(path.read_text()) if path.exists() else {}
    data.setdefault("registry", {})["ic"] = "$REG_KNOWN"
    data.setdefault("factory", {})["ic"] = "xfwx3-7yaaa-aaaas-qgxpq-cai"
    data.setdefault("user_site", {})["ic"] = "sznn6-uqaaa-aaaas-qgxqa-cai"
    path.write_text(json.dumps(data, indent=2) + "\n")
    print(path, data)
PY
cp -f canister_ids.json "$WIN/canister_ids.json"

FACTORY_ID="xfwx3-7yaaa-aaaas-qgxpq-cai"

echo "=== Install registry ==="
dfx deploy registry --network ic --yes

echo "=== Upgrade factory ==="
dfx deploy factory --network ic --yes

REG_ID=$(dfx canister id registry --network ic)
echo "Registry: $REG_ID"

echo "=== claim + authorize + wire ==="
dfx canister call registry claimOwner --network ic || true
dfx canister call registry setAuthorizedFactory "(principal \"$FACTORY_ID\")" --network ic
dfx canister call factory adminSetRegistry "(principal \"$REG_ID\")" --network ic
dfx canister call factory adminBackfillRegistry --network ic

echo "=== smoke ==="
dfx canister call registry health --network ic --query
dfx canister call registry getAuthorizedFactory --network ic --query
dfx canister call factory getRegistryId --network ic --query
dfx canister call registry getMintCount --network ic --query

echo DONE
