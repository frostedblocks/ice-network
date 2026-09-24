#!/bin/bash
set -euo pipefail
JS=$(curl -sL "https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
echo "bundle=$JS"
curl -sL "https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/$JS" -o /tmp/ice-bundle.js
echo "size=$(wc -c </tmp/ice-bundle.js)"
for s in sendGuestMessageToMaster createAnonymousMessagingActor "Guest inbox" "Message the founder" isGuestInbox; do
  if grep -F -q "$s" /tmp/ice-bundle.js; then
    echo "FOUND: $s"
  else
    echo "MISSING: $s"
  fi
done
