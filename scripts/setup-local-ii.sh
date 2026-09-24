#!/bin/bash
set -euo pipefail
export PATH="$HOME/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
PROJ="$HOME/ScaleSpace"
cd "$PROJ"

# Sync config from Windows workspace if present
if [ -f /mnt/c/Users/walt_/ScaleSpace/dfx.json ]; then
  cp /mnt/c/Users/walt_/ScaleSpace/dfx.json "$PROJ/dfx.json"
  cp /mnt/c/Users/walt_/ScaleSpace/frontend/src/App.jsx "$PROJ/frontend/src/App.jsx"
  cp /mnt/c/Users/walt_/ScaleSpace/frontend/vite.config.js "$PROJ/frontend/vite.config.js"
fi

mkdir -p internet_identity
cd internet_identity
if [ ! -f internet_identity_dev.wasm.gz ]; then
  echo "Downloading Internet Identity dev wasm..."
  curl -fsSL -o internet_identity_dev.wasm.gz \
    "https://github.com/dfinity/internet-identity/releases/latest/download/internet_identity_dev.wasm.gz"
fi
if [ ! -f internet_identity.did ]; then
  echo "Downloading Internet Identity candid..."
  curl -fsSL -o internet_identity.did \
    "https://github.com/dfinity/internet-identity/releases/latest/download/internet_identity.did"
fi
ls -la
cd "$PROJ"

# Ensure replica is up
if ! dfx ping >/dev/null 2>&1; then
  dfx start --background --clean
  sleep 3
fi

dfx deploy internet_identity
II_ID=$(dfx canister id internet_identity)
echo "Local II canister: $II_ID"

# Merge II id into frontend env
python3 - <<PY
import json, pathlib, re
proj = pathlib.Path("$PROJ")
ids = json.loads((proj / ".dfx/local/canister_ids.json").read_text())
ice = ids.get("ice", {}).get("local", "")
msg = ids.get("messaging", {}).get("local", "")
ii = ids.get("internet_identity", {}).get("local", "")
text = f"""# DFX CANISTER ENVIRONMENT VARIABLES
DFX_NETWORK=local
CANISTER_ID_ICE={ice}
CANISTER_ID_MESSAGING={msg}
CANISTER_ID_INTERNET_IDENTITY={ii}
# END DFX CANISTER ENVIRONMENT VARIABLES
"""
(proj / "frontend/.env.local").write_text(text)
print(text)
PY

echo ""
echo "DONE. Restart frontend: cd ~/ScaleSpace/frontend && npm run dev"
echo "Then LOG OUT, clear site data if needed, and log in again (local test login or local II)."
