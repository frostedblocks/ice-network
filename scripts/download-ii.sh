#!/bin/bash
set -uo pipefail
export PATH="$HOME/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
PROJ="$HOME/ScaleSpace"
# sync dfx.json
cp /mnt/c/Users/walt_/ScaleSpace/dfx.json "$PROJ/dfx.json" 2>/dev/null || true
mkdir -p "$PROJ/internet_identity"
cd "$PROJ/internet_identity"

if ! dfx ping >/dev/null 2>&1; then
  echo "Replica not running"
  exit 1
fi

cd "$PROJ"
dfx canister id internet_identity 2>/dev/null || dfx canister create internet_identity

TAGS=$(curl -fsSL "https://api.github.com/repos/dfinity/internet-identity/releases?per_page=50" \
  | python3 -c 'import sys,json; print("\n".join(x["tag_name"] for x in json.load(sys.stdin)))')

echo "Trying II releases for dfx 0.29.2 compatibility..."
for TAG in $TAGS; do
  echo ""
  echo "=== $TAG ==="
  cd "$PROJ/internet_identity"
  rm -f internet_identity_dev.wasm.gz
  if ! curl -fsSL -o internet_identity_dev.wasm.gz \
      "https://github.com/dfinity/internet-identity/releases/download/${TAG}/internet_identity_dev.wasm.gz" 2>/dev/null; then
    echo "skip (no wasm)"
    continue
  fi
  # did file (best effort)
  curl -fsSL -o internet_identity.did \
    "https://github.com/dfinity/internet-identity/releases/download/${TAG}/internet_identity.did" 2>/dev/null \
    || curl -fsSL -o internet_identity.did \
    "https://github.com/dfinity/internet-identity/releases/latest/download/internet_identity.did" 2>/dev/null || true

  SIZE=$(wc -c < internet_identity_dev.wasm.gz)
  echo "wasm size: $SIZE"
  cd "$PROJ"
  if dfx deploy internet_identity --mode=reinstall -y 2>/tmp/ii_err.txt; then
    echo "SUCCESS: $TAG"
    II=$(dfx canister id internet_identity)
    ICE=$(dfx canister id ice 2>/dev/null || true)
    MSG=$(dfx canister id messaging 2>/dev/null || true)
    cat > frontend/.env.local <<EOF
# DFX CANISTER ENVIRONMENT VARIABLES
DFX_NETWORK=local
CANISTER_ID_ICE=${ICE}
CANISTER_ID_MESSAGING=${MSG}
CANISTER_ID_INTERNET_IDENTITY=${II}
# END DFX CANISTER ENVIRONMENT VARIABLES
EOF
    echo "II=$II"
    cat frontend/.env.local
    echo "$TAG" > internet_identity/WORKING_TAG.txt
    exit 0
  else
    echo "failed:"
    tail -5 /tmp/ii_err.txt
  fi
done
echo "No compatible II found"
exit 1
