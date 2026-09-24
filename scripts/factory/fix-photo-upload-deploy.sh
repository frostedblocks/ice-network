#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

WIN_ICE="/mnt/c/Users/walt_/ice-network"
WIN_SS="/mnt/c/Users/walt_/ScaleSpace"
PROJ_ICE="/home/walt_wood1/ice-network"
PROJ_SS="/home/walt_wood1/ScaleSpace"

dfx identity use mynewdeploy

echo "=== 1) Build + upload user_site WASM ==="
cd "$PROJ_ICE"
mkdir -p src/user_site src/factory
cp -f "$WIN_ICE/src/user_site/main.mo" src/user_site/main.mo
cp -f "$WIN_ICE/src/factory/main.mo" src/factory/main.mo
dfx build user_site --network ic
WASM=".dfx/ic/canisters/user_site/user_site.wasm"
echo "WASM size: $(wc -c < "$WASM")"
dfx canister call factory clearUserSiteWasm --network ic
python3 <<'PY'
import subprocess, pathlib
data = pathlib.Path("/home/walt_wood1/ice-network/.dfx/ic/canisters/user_site/user_site.wasm").read_bytes()
chunk = 40000
for i in range(0, len(data), chunk):
    hx = data[i:i+chunk].hex()
    subprocess.check_call(
        ["dfx", "canister", "call", "factory", "appendUserSiteWasmHex", f'("{hx}")', "--network", "ic"]
    )
    print(f"chunk {i//chunk+1}")
print(subprocess.check_output(["dfx", "canister", "call", "factory", "finalizeUserSiteWasm", "--network", "ic"], text=True))
print(subprocess.check_output(["dfx", "canister", "call", "factory", "getWasmSize", "--network", "ic"], text=True))
PY

echo "=== 2) Deploy factory (adminSyncSiteOwner + EOP upgrade) ==="
dfx deploy factory --network ic --yes

echo "=== 3) Upgrade + sync owner on controllable sites ==="
for SITE in sll2h-yaaaa-aaaas-qgxta-cai scir3-oiaaa-aaaas-qgxsq-cai; do
  echo "--- $SITE ---"
  dfx canister call factory adminUpgradeUserSite "(principal \"$SITE\")" --network ic
  dfx canister call factory adminSyncSiteOwner "(principal \"$SITE\")" --network ic || true
  dfx canister call "$SITE" getOwner --network ic --query
  dfx canister call "$SITE" getPhotoQuota --network ic --query
done

echo "=== 4) Try sxpaw (may fail without factory controller) ==="
dfx canister call factory adminUpgradeUserSite '(principal "sxpaw-paaaa-aaaas-qgxra-cai")' --network ic || true

echo "=== 5) Deploy frontend assets ==="
cd "$PROJ_SS"
cat > canister_ids.json <<'EOF'
{
  "assets": { "ic": "6hhqv-baaaa-aaaan-q6mxq-cai" },
  "ice": { "ic": "6jf55-2qaaa-aaaan-q6mwq-cai" },
  "messaging": { "ic": "6agwb-myaaa-aaaan-q6mxa-cai" }
}
EOF
cp -f "$WIN_SS/frontend/src/"*.jsx frontend/src/
cp -f "$WIN_SS/frontend/src/"*.js frontend/src/
cp -f "$WIN_SS/frontend/src/"*.css frontend/src/ 2>/dev/null || true
cp -rf "$WIN_SS/frontend/src/declarations" frontend/src/
cd frontend
DFX_NETWORK=ic \
  CANISTER_ID_ICE=6jf55-2qaaa-aaaan-q6mwq-cai \
  CANISTER_ID_MESSAGING=6agwb-myaaa-aaaan-q6mxa-cai \
  VITE_CANISTER_ID_FACTORY=xfwx3-7yaaa-aaaas-qgxpq-cai \
  npm run build
cp -f public/*.html dist/ 2>/dev/null || true
cp -f .ic-assets.json dist/ 2>/dev/null || true
mkdir -p dist/.well-known
cp -f public/.well-known/* dist/.well-known/ 2>/dev/null || true
cd ..
dfx deploy assets --network ic --yes

echo DONE
