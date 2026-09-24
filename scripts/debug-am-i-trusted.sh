#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy
echo "principal=$(dfx identity get-principal)"

echo "=== amITrustedMaster ==="
dfx canister call messaging amITrustedMaster --network ic || echo "method missing"

TOKEN="DbgMasterReplyTok003"
echo "=== getGuestMessagesByToken (guest-visible?) ==="
dfx canister call messaging getGuestMessagesByToken "(\"$TOKEN\")" --network ic | head -c 800
echo

echo "=== getMyConversations ==="
dfx canister call messaging getMyConversations --network ic

# Also try calling with explicit principal check via candid UI style
echo "=== isGuestInbox 7 ==="
dfx canister call messaging isGuestInbox '(7)' --network ic
