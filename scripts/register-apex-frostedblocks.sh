#!/bin/bash
# Validate + register apex frostedblocks.com on the assets canister.
# Run AFTER DNS is fixed (see DOMAIN.md "Frosted Blocks — apex vs www"):
#   - GoDaddy domain forwarding OFF
#   - Apex points at ICP (Cloudflare CNAME flattening recommended)
#   - TXT _canister-id + CNAME _acme-challenge present
set -euo pipefail

DOMAIN="frostedblocks.com"
ASSETS_ID="6hhqv-baaaa-aaaan-q6mxq-cai"
API="https://icp0.io/custom-domains/v1"

echo "=== DNS quick check ==="
echo "Expected: no GoDaddy forwarding A (3.33.251.168 / 15.197.225.128)"
echo "Expected: _canister-id TXT = $ASSETS_ID"
echo "Expected: _acme-challenge CNAME → _acme-challenge.${DOMAIN}.icp2.io"
echo ""

echo "=== Live probe (before register) ==="
for path in "/" "/about" "/about.html" "/how-to-join" "/partners"; do
  code=$(curl -sL -o /dev/null -w "%{http_code}" --max-time 20 "https://${DOMAIN}${path}" || echo "000")
  echo "https://${DOMAIN}${path} -> $code"
done
echo ""

echo "=== Validate ==="
curl -sL "${API}/${DOMAIN}/validate"
echo ""
echo ""

echo "=== Register ==="
curl -sL -X POST "${API}/${DOMAIN}"
echo ""
echo ""

echo "=== Status ==="
curl -sL "${API}/${DOMAIN}"
echo ""
echo ""

echo "=== Live probe (after register; cert may take a few minutes) ==="
for path in "/" "/about" "/about.html" "/how-to-join" "/how-to-join.html" "/partners"; do
  code=$(curl -sL -o /dev/null -w "%{http_code}" --max-time 20 "https://${DOMAIN}${path}" || echo "000")
  echo "https://${DOMAIN}${path} -> $code"
done

echo ""
echo "www (control):"
curl -sL -o /dev/null -w "https://www.${DOMAIN}/about -> %{http_code}\n" --max-time 20 "https://www.${DOMAIN}/about" || true
echo "DONE"
