#!/bin/bash
# Deploy I.C.E. backends + frontend asset canister to Internet Computer mainnet.
set -euo pipefail

export PATH="${HOME}/.local/share/dfx/bin:/usr/local/bin:/usr/bin:/bin:${PATH}"
if [ -f "${HOME}/.local/share/dfx/env" ]; then
  # shellcheck source=/dev/null
  . "${HOME}/.local/share/dfx/env"
fi

# Prefer Linux project copy; fall back to Windows mount
if [ -f "${HOME}/ScaleSpace/dfx.json" ]; then
  PROJECT="${HOME}/ScaleSpace"
elif [ -f "/mnt/c/Users/walt_/ScaleSpace/dfx.json" ]; then
  PROJECT="/mnt/c/Users/walt_/ScaleSpace"
else
  PROJECT="$(cd "$(dirname "$0")/.." && pwd)"
fi
cd "$PROJECT"

# Node via nvm if present
export NVM_DIR="${HOME}/.nvm"
if [ -s "${NVM_DIR}/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "${NVM_DIR}/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || true
fi

export DFX_WARNING="${DFX_WARNING:--mainnet_plaintext_identity}"

echo "=== Project: $PROJECT ==="
echo "=== Identity: $(dfx identity whoami) ==="
echo "=== Principal: $(dfx identity get-principal) ==="
echo ""
echo "NOTE: Mainnet needs cycles (or ICP convertible to cycles)."
echo "  If deploy fails for lack of cycles, fund your identity first:"
echo "  https://docs.internetcomputer.org/building-apps/developer-tools/dfx/dfx-ledger"
echo ""

echo "=== 1) Deploy ice + messaging to IC ==="
dfx deploy ice --network ic --with-cycles 1000000000000
dfx deploy messaging --network ic --with-cycles 500000000000

echo "=== 2) Generate frontend declarations (from local build tools) ==="
# Declarations for candid/js — use installed wasm interfaces after deploy
dfx generate ice --network ic 2>/dev/null || dfx generate ice || true
dfx generate messaging --network ic 2>/dev/null || dfx generate messaging || true

# Ensure ids are visible at project root for Vite
if [ -f .dfx/ic/canister_ids.json ]; then
  # Merge into root canister_ids.json if needed (dfx usually does this)
  cp -f .dfx/ic/canister_ids.json canister_ids.json 2>/dev/null || true
fi

echo "=== Canister IDs (IC) ==="
dfx canister id ice --network ic
dfx canister id messaging --network ic

ICE_ID=$(dfx canister id ice --network ic)
MSG_ID=$(dfx canister id messaging --network ic)

# Write env for build tooling
cat > frontend/.env.production <<EOF
DFX_NETWORK=ic
CANISTER_ID_ICE=${ICE_ID}
CANISTER_ID_MESSAGING=${MSG_ID}
EOF

echo "=== 3) Build frontend for mainnet ==="
cd frontend
npm install
DFX_NETWORK=ic CANISTER_ID_ICE="$ICE_ID" CANISTER_ID_MESSAGING="$MSG_ID" npm run build
# Asset canister source is frontend/dist — also copy ic-assets if required
if [ -f .ic-assets.json ] && [ -d dist ]; then
  cp -f .ic-assets.json dist/.ic-assets.json 2>/dev/null || true
fi
cd ..

echo "=== 4) Deploy assets canister ==="
dfx deploy assets --network ic --with-cycles 500000000000

ASSETS_ID=$(dfx canister id assets --network ic)

echo ""
echo "=============================================="
echo "  I.C.E. is live on mainnet"
echo "=============================================="
echo "  App URL:  https://${ASSETS_ID}.icp0.io/"
echo "  (alt)     https://${ASSETS_ID}.raw.icp0.io/"
echo "  ice:      ${ICE_ID}"
echo "  messaging:${MSG_ID}"
echo ""
echo "  Next steps in the browser:"
echo "  1. Open the App URL"
echo "  2. Login with Internet Identity (your real II)"
echo "  3. Profile → Claim Master Profile (first claimer wins)"
echo "=============================================="
