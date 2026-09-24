#!/bin/bash
# Prove LiteAdmin owner-only writes: non-owner and anonymous must get #unauthorized.
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

ICE="6jf55-2qaaa-aaaan-q6mwq-cai"

echo "=== identities ==="
dfx identity list 2>/dev/null || true

echo ""
echo "=== getLiteAdmin (public query) ==="
dfx identity use mynewdeploy >/dev/null
dfx canister call "$ICE" getLiteAdmin --network ic --query

echo ""
echo "=== canManageLiteAdmin as mynewdeploy (vm63y — ICE master, NOT Lite owner) ==="
dfx canister call "$ICE" canManageLiteAdmin --network ic --query

echo ""
echo "=== setSignupsOpen(false) as mynewdeploy — MUST be #unauthorized ==="
dfx canister call "$ICE" setSignupsOpen "(false)" --network ic

echo ""
echo "=== banLiteHandle as mynewdeploy — MUST be #unauthorized ==="
dfx canister call "$ICE" banLiteHandle "(\"evil-handle\")" --network ic

echo ""
echo "=== anonymous identity attempt ==="
dfx identity use anonymous >/dev/null 2>&1 || dfx identity new anonymous --storage-mode plaintext >/dev/null 2>&1 || true
dfx identity use anonymous >/dev/null
echo "anon principal: $(dfx identity get-principal)"
dfx canister call "$ICE" setFeedBridgeOpen "(false)" --network ic || echo "(call failed — expected if anonymous cannot update)"

echo ""
echo "=== restore mynewdeploy; re-read state (must still be defaults if rejects worked) ==="
dfx identity use mynewdeploy >/dev/null
dfx canister call "$ICE" getLiteAdmin --network ic --query

echo ""
echo "NOTE: Owner write test requires II gmtr2-… in a dfx identity."
echo "If you have it: dfx identity use <gmtr2-identity>; dfx canister call $ICE setSignupsOpen \"(true)\" --network ic"
echo "DONE"
