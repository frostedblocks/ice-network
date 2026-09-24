#!/bin/bash
# Lean product deploy from repo root: ice → factory → assets
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="$HOME/.local/share/dfx/bin:$PATH"
dfx identity use mynewdeploy

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== 1/3 ice ==="
dfx deploy ice --network ic --yes
echo "=== migrate Join fee off ==="
dfx canister call ice ensurePaymentsLive --network ic || true
dfx canister call ice ensureRegistrationFee5Icp --network ic || true
dfx canister call ice isRegistrationFeeEnabled --network ic

echo "=== 2/3 factory ==="
dfx deploy factory --network ic --yes
dfx canister call factory getFees --network ic

echo "=== 3/3 assets (build frontend) ==="
cd assets
if [ ! -d node_modules ]; then
  npm install --no-fund --no-audit
fi
DFX_NETWORK=ic \
  CANISTER_ID_ICE=6jf55-2qaaa-aaaan-q6mwq-cai \
  VITE_CANISTER_ID_ICE=6jf55-2qaaa-aaaan-q6mwq-cai \
  VITE_CANISTER_ID_FACTORY=xfwx3-7yaaa-aaaas-qgxpq-cai \
  VITE_DFX_NETWORK=ic \
  npm run build
mkdir -p dist/admin dist/.well-known
cp -f public/*.html dist/ 2>/dev/null || true
cp -f public/admin/*.html dist/admin/ 2>/dev/null || true
cp -f public/sitemap.xml dist/ 2>/dev/null || true
cp -f .ic-assets.json dist/ 2>/dev/null || true
cp -f public/.well-known/* dist/.well-known/ 2>/dev/null || true
cd "$ROOT"
dfx deploy assets --network ic --yes

echo "=== VERIFY ==="
dfx canister call ice isRegistrationFeeEnabled --network ic
dfx canister call factory getFees --network ic
JS=$(ls assets/dist/assets/index-*.js 2>/dev/null | head -1 || true)
echo "bundle=$JS"
if [ -n "${JS:-}" ]; then
  echo -n "Create username (free): "; grep -c 'Create username (free)' "$JS" || true
  echo -n "Mint site: "; grep -c 'Mint site' "$JS" || true
fi
echo DONE
