#!/bin/bash
# Register a custom domain for the I.C.E. assets canister on mainnet.
# Usage: bash scripts/register-custom-domain.sh your.domain.com
set -euo pipefail

DOMAIN="${1:-}"
ASSETS_ID="${2:-6hhqv-baaaa-aaaan-q6mxq-cai}"

if [ -z "$DOMAIN" ]; then
  echo "Usage: $0 <domain> [assets-canister-id]"
  echo "Example: $0 app.example.com"
  exit 1
fi

echo "Domain:     $DOMAIN"
echo "Assets ID:  $ASSETS_ID"
echo ""
echo "=== Validate ==="
curl -sL -X GET "https://icp0.io/registrations?domain=${DOMAIN}" 2>/dev/null || true
echo ""
curl -sL -X GET "https://icp.net/custom-domains/v1/${DOMAIN}/validate"
echo ""
echo ""
echo "=== Register ==="
curl -sL -X POST \
  -H "Content-Type: application/json" \
  -d "{\"canisterId\":\"${ASSETS_ID}\"}" \
  "https://icp0.io/registrations" 2>/dev/null || true
echo ""
# Newer API shape
curl -sL -X POST "https://icp.net/custom-domains/v1/${DOMAIN}"
echo ""
echo ""
echo "=== Status ==="
curl -sL -X GET "https://icp.net/custom-domains/v1/${DOMAIN}"
echo ""
