#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy

TOKEN="DbgMasterReplyTok002"
CIPHER="ice1:AAAAAAAAAAAAAAAAAAAAdebugcipherpayload02"

echo "=== fresh guest chat ==="
RES=$(dfx canister call messaging startOrContinueGuestChat "(\"$TOKEN\", \"\", \"$CIPHER\")" --network ic)
echo "$RES"
CID=$(echo "$RES" | sed -n 's/.*conversationId = \([0-9_]*\).*/\1/p' | tr -d '_' | head -1)
echo "cid=$CID"

echo "=== listOpenGuestThreads (should include cid if vm63y trusted) ==="
dfx canister call messaging listOpenGuestThreads --network ic

echo "=== getGuestThreadToken ==="
dfx canister call messaging getGuestThreadToken "($CID)" --network ic

echo "=== sendMessage ==="
dfx canister call messaging sendMessage "($CID, \"founder reply test\")" --network ic

echo "=== getMessages ==="
dfx canister call messaging getMessages "($CID)" --network ic | head -c 600
echo
