#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:/home/walt_wood1/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

CTRL="gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae"
PROJ="/home/walt_wood1/frosted-blocks"
# 0.6 TC each: 500B creation fee + ~100B starting balance
CYCLES_EACH="600000000000"

cd "$PROJ"
dfx identity use mynewdeploy

echo "=== BEFORE ==="
echo "principal: $(dfx identity get-principal)"
dfx ledger balance --network ic
dfx cycles balance --network ic

# Convert ICP -> cycles if needed (leave ~1 ICP for later fees)
BAL_TC=$(dfx cycles balance --network ic 2>/dev/null | awk '{print $1}')
echo "cycles balance TC parse: $BAL_TC"
# Convert 2 ICP to cycles for headroom
echo "=== CONVERT 2 ICP -> cycles ==="
dfx cycles convert --amount 2 --network ic

echo "=== AFTER CONVERT ==="
dfx ledger balance --network ic
dfx cycles balance --network ic

mkdir -p backend dist
if [ ! -f backend/main.mo ]; then
  cat > backend/main.mo <<'EOF'
persistent actor Main {
  public query func ping() : async Text { "ok" };
};
EOF
fi
if [ ! -f dist/index.html ]; then
  echo '<!doctype html><html><body>Reserved (no app installed yet)</body></html>' > dist/index.html
fi

# Ensure dfx.json exists
if [ ! -f dfx.json ]; then
  cat > dfx.json <<'EOF'
{
  "canisters": {
    "backend": { "main": "backend/main.mo", "type": "motoko" },
    "frontend": {
      "dependencies": ["backend"],
      "frontend": { "entrypoint": "dist/index.html" },
      "source": ["dist"],
      "type": "assets"
    }
  },
  "version": 1
}
EOF
fi

echo "=== CREATE backend ==="
dfx canister create backend --network ic --with-cycles "$CYCLES_EACH"

echo "=== CREATE frontend ==="
dfx canister create frontend --network ic --with-cycles "$CYCLES_EACH"

BACKEND_ID=$(dfx canister id backend --network ic)
FRONTEND_ID=$(dfx canister id frontend --network ic)

echo "=== ADD CONTROLLER $CTRL ==="
dfx canister update-settings backend --add-controller "$CTRL" --network ic
dfx canister update-settings frontend --add-controller "$CTRL" --network ic

echo "=== STATUS ==="
for c in backend frontend; do
  echo "---- $c ----"
  dfx canister id "$c" --network ic
  dfx canister info "$c" --network ic
done

echo "=== FINAL BALANCES ==="
dfx ledger balance --network ic
dfx cycles balance --network ic

# Mirror IDs to Windows project
mkdir -p /mnt/c/Users/walt_/frosted-blocks
cat > /mnt/c/Users/walt_/frosted-blocks/canister_ids.json <<EOF
{
  "backend": { "ic": "$BACKEND_ID" },
  "frontend": { "ic": "$FRONTEND_ID" }
}
EOF
cp -f .dfx/ic/canister_ids.json /mnt/c/Users/walt_/frosted-blocks/.dfx-ic-canister_ids.json 2>/dev/null || true

echo ""
echo "========================================"
echo "CREATED (empty — no app code installed)"
echo "backend:  $BACKEND_ID"
echo "frontend: $FRONTEND_ID"
echo "controller: $CTRL + mynewdeploy"
echo "========================================"
echo "DONE"
