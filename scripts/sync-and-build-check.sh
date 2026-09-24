#!/bin/bash
set -euo pipefail
WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
export PATH="/home/walt_wood1/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
export NVM_DIR="/home/walt_wood1/.nvm"
# shellcheck source=/dev/null
. "$NVM_DIR/nvm.sh"
nvm use 20

mkdir -p "$PROJ/scripts" "$PROJ/frontend/src"
cp "$WIN/dfx.json" "$PROJ/"
cp "$WIN/LAUNCH.md" "$PROJ/"
cp "$WIN/README.md" "$PROJ/"
cp "$WIN/frontend/vite.config.js" "$PROJ/frontend/"
cp "$WIN/frontend/package.json" "$PROJ/frontend/"
cp "$WIN/frontend/.ic-assets.json" "$PROJ/frontend/"
cp "$WIN/frontend/src/App.jsx" "$PROJ/frontend/src/"
cp "$WIN/frontend/src/Subscribe.jsx" "$PROJ/frontend/src/" 2>/dev/null || true
cp "$WIN/frontend/src/TokenBalance.jsx" "$PROJ/frontend/src/" 2>/dev/null || true
cp "$WIN/scripts/deploy-mainnet.sh" "$PROJ/scripts/"
chmod +x "$PROJ/scripts/deploy-mainnet.sh"

cd "$PROJ/frontend"
echo "=== npm run build (local ids) ==="
DFX_NETWORK=local npm run build
test -f dist/index.html
cp -f .ic-assets.json dist/.ic-assets.json
ls -la dist | head -20
echo "BUILD_OK"
