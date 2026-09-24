#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"
dfx identity use mynewdeploy >/dev/null
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai adminSetPrincipalMigration "(true)" --network ic
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai getPrincipalMigrationStatus --network ic --query
