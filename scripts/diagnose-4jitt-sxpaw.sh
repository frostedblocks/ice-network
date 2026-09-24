#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"
dfx identity use mynewdeploy >/dev/null

FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"
ICE="6jf55-2qaaa-aaaan-q6mwq-cai"
USER="4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe"
SITE="sxpaw-paaaa-aaaas-qgxra-cai"

echo "=== getUserCanister(4jitt) ==="
dfx canister call "$FACTORY" getUserCanister "(principal \"$USER\")" --network ic --query

echo "=== isRegistered / isOwner / getProfile ==="
dfx canister call "$ICE" isRegistered "(principal \"$USER\")" --network ic --query
dfx canister call "$ICE" isOwner "(principal \"$USER\")" --network ic --query
dfx canister call "$ICE" getProfile "(principal \"$USER\")" --network ic --query | head -40

echo "=== sxpaw status ==="
dfx canister status "$SITE" --network ic 2>&1 | head -30 || true

echo "=== isFactoryControllerOf sxpaw ==="
dfx canister call "$FACTORY" isFactoryControllerOf "(principal \"$SITE\")" --network ic 2>&1 || true

echo "=== live FE bundle contains 4jitt? ==="
JS=$(curl -sL "https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
echo "bundle=$JS"
curl -sL "https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/$JS" -o /tmp/icefe.js
grep -c "4jitt-jjzlt" /tmp/icefe.js || true
grep -c "error contact admin" /tmp/icefe.js || true
