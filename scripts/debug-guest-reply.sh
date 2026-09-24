#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy

echo "=== identities ==="
dfx identity get-principal

echo "=== try list as anonymous via candid? skip ==="

# Create a guest thread with client token + cipher, then try master-like send from mynewdeploy
TOKEN="DebugReplyTokenFixed01"
CIPHER="ice1:AAAAAAAAAAAAAAAAAAAAdebugcipherpayloadxx"

echo "=== start guest chat ==="
dfx canister call messaging startOrContinueGuestChat "(\"$TOKEN\", \"\", \"$CIPHER\")" --network ic

echo "=== isGuestInbox / get messages by token ==="
# parse conversation id from previous is hard; call list won't work for non-master
dfx canister call messaging getGuestMessagesByToken "(\"$TOKEN\")" --network ic | head -c 800
echo

echo "=== getGuestThreadToken as non-master (should be null) ==="
# need conversation id - extract from start result by re-calling continue? 
# Use a known approach: start returns id in output - we capture it
OUT=$(dfx canister call messaging startOrContinueGuestChat "(\"$TOKEN\", \"\", \"$CIPHER\")" --network ic 2>&1 || true)
echo "$OUT"

echo DONE
