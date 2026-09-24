#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy
for i in $(seq 0 30); do
  r=$(dfx canister call messaging isGuestInbox "($i)" --network ic 2>/dev/null | tr -d '\r')
  echo "id=$i $r"
  if echo "$r" | grep -q 'true'; then
    echo "FOUND_GUEST_INBOX=$i"
    break
  fi
done
