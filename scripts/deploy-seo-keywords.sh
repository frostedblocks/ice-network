#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

dfx identity use mynewdeploy
WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
cd "$PROJ"

cat > canister_ids.json <<'EOF'
{
  "assets": { "ic": "6hhqv-baaaa-aaaan-q6mxq-cai" },
  "ice": { "ic": "6jf55-2qaaa-aaaan-q6mwq-cai" },
  "messaging": { "ic": "6agwb-myaaa-aaaan-q6mxa-cai" }
}
EOF

mkdir -p frontend/public frontend/src frontend/dist
cp -f "$WIN/frontend/index.html" frontend/index.html
cp -f "$WIN/frontend/public/landing.html" frontend/public/landing.html
cp -f "$WIN/frontend/public/about.html" frontend/public/about.html
cp -f "$WIN/frontend/public/how-to-join.html" frontend/public/how-to-join.html
cp -f "$WIN/frontend/public/sitemap.xml" frontend/public/sitemap.xml 2>/dev/null || true
cp -f "$WIN/frontend/src/PublicLanding.jsx" frontend/src/PublicLanding.jsx
# keep other src in sync for build
cp -f "$WIN/frontend/src/"*.jsx frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.js frontend/src/ 2>/dev/null || true
cp -f "$WIN/frontend/src/"*.css frontend/src/ 2>/dev/null || true
cp -rf "$WIN/frontend/src/declarations" frontend/src/ 2>/dev/null || true

cd frontend
DFX_NETWORK=ic \
  CANISTER_ID_ICE=6jf55-2qaaa-aaaan-q6mwq-cai \
  CANISTER_ID_MESSAGING=6agwb-myaaa-aaaan-q6mxa-cai \
  VITE_CANISTER_ID_FACTORY=xfwx3-7yaaa-aaaas-qgxpq-cai \
  npm run build
# Vite may not overwrite all public HTML into dist depending on config — force copy
cp -f public/*.html dist/ 2>/dev/null || true
cp -f public/sitemap.xml dist/ 2>/dev/null || true
# Ensure SPA index has SEO from source index.html (vite uses frontend/index.html)
test -f dist/index.html
cd ..

dfx deploy assets --network ic --yes
echo "SEO keywords deployed"
echo DONE
