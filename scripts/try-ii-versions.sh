#!/bin/bash
set -uo pipefail
export PATH="$HOME/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
PROJ="$HOME/ScaleSpace"
cd "$PROJ"
mkdir -p internet_identity

# Known-good era for older dfx + has frontend assets
TAGS=(
  "release-2024-10-17"
  "release-2024-09-26"
  "release-2024-08-15"
  "release-2024-05-13"
  "release-2024-04-05"
  "release-2024-02-16"
  "release-2024-01-26"
  "release-2023-11-17"
  "release-2023-10-27"
  "release-2025-01-17"
  "release-2025-02-14"
  "release-2025-03-03"
  "release-2025-04-11"
  "release-2025-06-06"
  "release-2025-09-05"
  "release-2025-12-05"
  "release-2026-01-16"
  "release-2026-03-06"
  "release-2026-05-08"
  "release-2026-06-12"
  "release-2026-07-10"
  "release-2026-07-17"
)

check_assets() {
  local body
  body=$(dfx canister call internet_identity http_request '(record { url = "/"; method = "GET"; body = vec {}; headers = vec {}; certificate_version = opt (2 : nat16) })' 2>/dev/null | head -5)
  echo "$body" | head -3
  if echo "$body" | grep -qi "Asset / not found"; then
    return 1
  fi
  if echo "$body" | grep -qi "html\|DOCTYPE\|status_code = 200"; then
    return 0
  fi
  # any non-404 body
  if echo "$body" | grep -q 'status_code = 200'; then
    return 0
  fi
  return 1
}

for TAG in "${TAGS[@]}"; do
  echo ""
  echo "======== $TAG ========"
  cd "$PROJ/internet_identity"
  if ! curl -fsSL -o internet_identity_dev.wasm.gz \
    "https://github.com/dfinity/internet-identity/releases/download/${TAG}/internet_identity_dev.wasm.gz"; then
    echo "no wasm"
    continue
  fi
  curl -fsSL -o internet_identity.did \
    "https://github.com/dfinity/internet-identity/releases/download/${TAG}/internet_identity.did" 2>/dev/null || true
  echo "size=$(wc -c < internet_identity_dev.wasm.gz)"
  cd "$PROJ"
  if ! dfx deploy internet_identity --mode=reinstall -y >/tmp/ii_dep.log 2>&1; then
    echo "deploy failed:"
    tail -3 /tmp/ii_dep.log
    continue
  fi
  echo "deployed"
  if check_assets; then
    echo "ASSETS OK with $TAG"
    echo "$TAG" > internet_identity/WORKING_TAG.txt
    II=$(dfx canister id internet_identity)
    ICE=$(dfx canister id ice)
    MSG=$(dfx canister id messaging)
    cat > frontend/.env.local <<EOF
# DFX CANISTER ENVIRONMENT VARIABLES
DFX_NETWORK=local
CANISTER_ID_ICE=${ICE}
CANISTER_ID_MESSAGING=${MSG}
CANISTER_ID_INTERNET_IDENTITY=${II}
# END DFX CANISTER ENVIRONMENT VARIABLES
EOF
    # probe paths
    for path in "/" "/index.html" "/index.html?raw" "/authorization"; do
      echo "path $path:"
      dfx canister call internet_identity http_request "(record { url = \"$path\"; method = \"GET\"; body = vec {}; headers = vec {}; certificate_version = opt (2 : nat16) })" 2>/dev/null | head -8
    done
    exit 0
  else
    echo "no assets for $TAG"
  fi
done
echo "none worked"
exit 1
