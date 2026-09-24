#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ScaleSpace
dfx identity use mynewdeploy

echo "=== startOrContinueGuestChat ==="
dfx canister call messaging startOrContinueGuestChat '("","Smoke Guest","hello from secret-link smoke")' --network ic

echo "=== bundle check ==="
JS=$(curl -sL "https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
echo "bundle=$JS"
curl -sL "https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/$JS" -o /tmp/ice-bundle2.js
for s in startOrContinueGuestChat getGuestMessagesByToken "Copy link" "Start chat" "Guest chat"; do
  if grep -F -q "$s" /tmp/ice-bundle2.js; then echo "FOUND: $s"; else echo "MISSING: $s"; fi
done
echo SMOKE_OK
