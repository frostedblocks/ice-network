#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy

echo "=== sendGuestMessageToMaster ==="
dfx canister call messaging sendGuestMessageToMaster '("Smoke Test", "Guest inbox via messaging canister smoke test")' --network ic

echo "=== getDefaultMasterPrincipal ==="
dfx canister call messaging getDefaultMasterPrincipal --network ic

echo "=== isGuestInbox(0) ==="
dfx canister call messaging isGuestInbox '(0)' --network ic || true

echo "SMOKE_OK"
