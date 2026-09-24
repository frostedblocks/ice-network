#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy

TOKEN="SmokeTokenEncryptTest01"
CIPHER='ice1:AAAAAAAAAAAAAAAAAAAA_ciphertext_placeholder_for_smoke'

echo "=== start encrypted guest chat ==="
dfx canister call messaging startOrContinueGuestChat "(\"$TOKEN\", \"\", \"$CIPHER\")" --network ic

echo "=== getGuestMessagesByToken (should be ice1:) ==="
dfx canister call messaging getGuestMessagesByToken "(\"$TOKEN\")" --network ic | head -c 500
echo

echo "=== bundle ==="
JS=$(curl -sL "https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
echo "bundle=$JS"
curl -sL "https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/$JS" -o /tmp/ice-enc.js
for s in getGuestThreadToken generateGuestToken ice1: "Encrypted private chat" encryptGuestPayload; do
  if grep -F -q "$s" /tmp/ice-enc.js; then echo "FOUND: $s"; else echo "MISSING: $s"; fi
done
echo SMOKE_OK
