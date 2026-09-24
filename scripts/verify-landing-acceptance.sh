#!/bin/bash
set -euo pipefail

check() {
  local url="$1"
  local want="$2"
  local code
  code=$(curl -sL -o /tmp/page.html -w "%{http_code}" "$url" || echo "000")
  echo "URL $url -> HTTP $code"
  if grep -F -q "$want" /tmp/page.html; then
    echo "  FOUND: $want"
  else
    # SPA may only have shell; check JS for homepage strings
    if echo "$url" | grep -qE '/(about|how-to-join|partners)'; then
      echo "  MISSING in HTML: $want"
    fi
  fi
}

echo "=== Static pages (apex) ==="
check "https://frostedblocks.com/about" "What it is"
check "https://frostedblocks.com/how-to-join" "How to join ICE"
check "https://frostedblocks.com/partners" "Affiliate disclosure"
check "https://www.frostedblocks.com/about" "What it is"
check "https://www.frostedblocks.com/how-to-join.html" "Create your account"

echo "=== Homepage bundle ==="
JS=$(curl -sL "https://www.frostedblocks.com/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
echo "bundle=$JS"
curl -sL "https://www.frostedblocks.com/$JS" -o /tmp/app.js
for s in \
  "User-controlled" \
  "Explore the public feed" \
  "Create your account" \
  "Before you create an account" \
  "Public preview" \
  "Affiliate disclosure" \
  "Own your data"
do
  if grep -F -q "$s" /tmp/app.js; then echo "FOUND: $s"; else echo "MISSING: $s"; fi
done
# Should NOT appear as primary CTA voice
for s in "Sign in with id.ai" "Join ICE Network ICP" "Login (classic"; do
  if grep -F -q "$s" /tmp/app.js; then echo "UNEXPECTED: $s"; else echo "OK absent: $s"; fi
done
echo DONE
