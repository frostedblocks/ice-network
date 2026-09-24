#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"

ICE="6jf55-2qaaa-aaaan-q6mwq-cai"

echo "=== owner identity ==="
dfx identity use owner
echo "principal=$(dfx identity get-principal)"
echo "canManageLiteAdmin:"
dfx canister call "$ICE" canManageLiteAdmin --network ic --query
echo "setSignupsOpen(true):"
dfx canister call "$ICE" setSignupsOpen "(true)" --network ic
echo "banLiteHandle test-then-unban:"
dfx canister call "$ICE" banLiteHandle "(\"verify-temp\")" --network ic
dfx canister call "$ICE" unbanLiteHandle "(\"verify-temp\")" --network ic
echo "getLiteAdmin:"
dfx canister call "$ICE" getLiteAdmin --network ic --query

dfx identity use mynewdeploy >/dev/null
echo DONE
