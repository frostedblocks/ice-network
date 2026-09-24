#!/bin/bash
set -u
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"
dfx identity use mynewdeploy >/dev/null

ICE="6jf55-2qaaa-aaaan-q6mwq-cai"
PASS=0
FAIL=0
WARN=0

ok() { echo "[PASS] $*"; PASS=$((PASS+1)); }
bad() { echo "[FAIL] $*"; FAIL=$((FAIL+1)); }
warn() { echo "[WARN] $*"; WARN=$((WARN+1)); }

echo "======== ICE Lite admin (canister) ========"
PRIN=$(dfx identity get-principal)
echo "caller=$PRIN"

CLAIMED=$(dfx canister call "$ICE" isLiteAdminClaimed --network ic --query 2>/dev/null || echo "ERR")
echo "isLiteAdminClaimed=$CLAIMED"
CAN=$(dfx canister call "$ICE" canManageLiteAdmin --network ic --query 2>/dev/null || echo "ERR")
echo "canManageLiteAdmin=$CAN"

WRITE=$(dfx canister call "$ICE" setSignupsOpen "(true)" --network ic 2>/dev/null || echo "ERR")
echo "setSignupsOpen=$WRITE"
if echo "$WRITE" | grep -q unauthorized; then
  ok "Non-owner write rejected (#unauthorized)"
else
  bad "Non-owner write was NOT rejected: $WRITE"
fi

CLAIM=$(dfx canister call "$ICE" claimLiteAdmin --network ic 2>/dev/null || echo "ERR")
echo "claimLiteAdmin=$CLAIM"
# mynewdeploy is master — claim may succeed once or say already claimed
if echo "$CLAIM" | grep -qiE "Not authorized|already activated|already active|activated for this"; then
  ok "claimLiteAdmin returns controlled message (master path)"
else
  warn "Unexpected claimLiteAdmin response: $CLAIM"
fi

ADMIN=$(dfx canister call "$ICE" getLiteAdmin --network ic --query 2>/dev/null || echo "ERR")
echo "getLiteAdmin=$ADMIN"
if echo "$ADMIN" | grep -q signupsOpen; then
  ok "getLiteAdmin public query works"
else
  bad "getLiteAdmin failed"
fi

echo ""
echo "======== Lite HTTP APIs ========"
STATS=$(curl -sS --max-time 20 https://lite.frostedblocks.com/api/stats || echo FAIL)
echo "stats=$STATS"
if echo "$STATS" | grep -q registeredUsers; then
  ok "stats endpoint returns aggregate counts"
  if echo "$STATS" | grep -qiE 'email|password|phone|@'; then
    bad "stats may leak PII"
  else
    ok "stats response has no obvious PII"
  fi
else
  bad "stats endpoint broken"
fi

FEED=$(curl -sS --max-time 20 "https://lite.frostedblocks.com/api/lite-feed?limit=2" || echo FAIL)
echo "lite-feed=$FEED"
if echo "$FEED" | grep -q '"source":"lite"'; then
  ok "lite-feed endpoint OK"
  if echo "$FEED" | grep -qiE 'email|password_hash|phone'; then
    bad "lite-feed may leak PII"
  else
    ok "lite-feed has no obvious PII fields"
  fi
else
  bad "lite-feed endpoint broken: $FEED"
fi

EVIL=$(curl -sSI --max-time 20 -H "Origin: https://evil.example" https://lite.frostedblocks.com/api/stats 2>/dev/null | tr -d '\r')
if echo "$EVIL" | grep -qi "access-control-allow-origin: https://evil.example"; then
  bad "CORS allows evil.example on /api/stats"
else
  ok "CORS does not reflect evil Origin on /api/stats"
fi

GOOD=$(curl -sSI --max-time 20 -H "Origin: https://www.frostedblocks.com" https://lite.frostedblocks.com/api/lite-feed 2>/dev/null | tr -d '\r')
if echo "$GOOD" | grep -qi "access-control-allow-origin: https://www.frostedblocks.com"; then
  ok "CORS allows www.frostedblocks.com on lite-feed"
else
  bad "CORS missing for www on lite-feed"
fi
if echo "$GOOD" | grep -qi "cross-origin-resource-policy: cross-origin"; then
  ok "CORP cross-origin on lite-feed (needed for ICE FE)"
else
  warn "CORP not cross-origin on lite-feed"
fi

CSP=$(curl -sSI --max-time 20 https://lite.frostedblocks.com/ 2>/dev/null | tr -d '\r' | grep -i content-security-policy || true)
echo "CSP=$CSP"
if echo "$CSP" | grep -q "strict-dynamic" && echo "$CSP" | grep -q "nonce-"; then
  ok "Lite homepage has nonce CSP"
else
  bad "Lite homepage CSP missing nonce/strict-dynamic"
fi
if echo "$CSP" | grep -q "https:" && echo "$CSP" | grep -q "unsafe-inline"; then
  ok "Safari CSP fallbacks present"
else
  warn "Safari CSP fallbacks missing"
fi

echo ""
echo "======== Mutating API CSRF-ish checks ========"
POSTH=$(curl -sSI --max-time 20 -X POST -H "Origin: https://evil.example" -H "Content-Type: application/json" \
  -d '{}' https://lite.frostedblocks.com/api/auth/signup 2>/dev/null | tr -d '\r')
echo "$POSTH" | head -12
if echo "$POSTH" | grep -qiE "HTTP/2 403|HTTP/1.1 403"; then
  ok "signup POST from evil Origin blocked (403)"
elif echo "$POSTH" | grep -qi "Request blocked"; then
  ok "signup POST blocked by middleware"
else
  # May be 400 after middleware if origin check only when Origin present — evil should 403
  CODE=$(echo "$POSTH" | head -1)
  warn "signup evil Origin response: $CODE (expect 403)"
fi

echo ""
echo "======== ICE assets headers ========"
ICEH=$(curl -sSI --max-time 20 https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/ 2>/dev/null | tr -d '\r')
echo "$ICEH" | grep -iE "content-security|x-frame|strict-transport|x-content" || true
if echo "$ICEH" | grep -qi "x-frame-options: DENY"; then
  ok "ICE assets X-Frame-Options DENY"
else
  warn "ICE assets missing X-Frame-Options DENY"
fi
if echo "$ICEH" | grep -qi "lite.frostedblocks.com"; then
  ok "ICE CSP allows connect to lite.frostedblocks.com"
else
  warn "ICE CSP may block lite.frostedblocks.com connect-src (check index.html headers)"
fi

echo ""
echo "======== SUMMARY ========"
echo "PASS=$PASS FAIL=$FAIL WARN=$WARN"
if [ "$FAIL" -gt 0 ]; then exit 1; fi
exit 0
