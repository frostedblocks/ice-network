#!/usr/bin/env bash
# Seed Factory connectBackendPrincipal + trustedRecorder on existing user_sites.
# Run on Heavy with dfx + Factory owner identity. Do NOT run against mainnet from the agent box.
#
# Usage:
#   CONNECT_PRINCIPAL=aaaaa-... SITE_IDS="site1 site2" bash scripts/ops-seed-connect-backend.sh
#   CONNECT_PRINCIPAL=aaaaa-... bash scripts/ops-seed-connect-backend.sh site1 site2
set -euo pipefail

NETWORK="${NETWORK:-ic}"
FACTORY="${FACTORY:-factory}"
CONNECT_PRINCIPAL="${CONNECT_PRINCIPAL:-}"

if [[ -z "$CONNECT_PRINCIPAL" ]]; then
  echo "ERROR: set CONNECT_PRINCIPAL to the Connect backend IC principal" >&2
  echo "  (from: cd connect-backend && npx tsx scripts/print-principal.ts)" >&2
  exit 1
fi

if [[ $# -gt 0 ]]; then
  SITES=("$@")
elif [[ -n "${SITE_IDS:-}" ]]; then
  # shellcheck disable=SC2206
  SITES=($SITE_IDS)
else
  echo "ERROR: pass site canister ids as args or set SITE_IDS" >&2
  exit 1
fi

export DFX_WARNING="${DFX_WARNING:--mainnet_plaintext_identity}"

echo "=== adminSetConnectBackend ($CONNECT_PRINCIPAL) ==="
dfx canister --network "$NETWORK" call "$FACTORY" adminSetConnectBackend \
  "(principal \"$CONNECT_PRINCIPAL\")"

echo "=== getConnectBackend ==="
dfx canister --network "$NETWORK" call "$FACTORY" getConnectBackend --query

for SITE_ID in "${SITES[@]}"; do
  echo "=== adminSeedTrustedRecorderOnSite ($SITE_ID) ==="
  dfx canister --network "$NETWORK" call "$FACTORY" adminSeedTrustedRecorderOnSite \
    "(principal \"$SITE_ID\")"
done

echo "DONE — rebuild assets with VITE_CONNECT_API_ORIGIN set (see docs/CONNECT_OPS.md)"
