#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy
PRIN=$(dfx identity get-principal)
echo "principal=$PRIN"

TOKEN="DbgMasterReplyTok001"
CIPHER="ice1:AAAAAAAAAAAAAAAAAAAAdebugcipherpayload01"

echo "=== create/continue guest ==="
RES=$(dfx canister call messaging startOrContinueGuestChat "(\"$TOKEN\", \"\", \"$CIPHER\")" --network ic)
echo "$RES"
# Extract conversation id: conversationId = N : nat
CID=$(echo "$RES" | sed -n 's/.*conversationId = \([0-9_]*\).*/\1/p' | tr -d '_' | head -1)
echo "cid=$CID"

echo "=== getGuestThreadToken (expect null for non-trusted messaging master) ==="
dfx canister call messaging getGuestThreadToken "($CID)" --network ic || true

echo "=== sendMessage plaintext as mynewdeploy ==="
dfx canister call messaging sendMessage "($CID, \"hello from deploy identity\")" --network ic || true

echo "=== isGuestInbox ==="
dfx canister call messaging isGuestInbox "($CID)" --network ic || true
