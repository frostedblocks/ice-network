#!/bin/bash
set -euo pipefail
JS=$(curl -sL "https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/" | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' | head -1)
echo "bundle=$JS"
curl -sL "https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/$JS" -o /tmp/land.js
for s in "User-controlled" "Explore the public feed" "Create your account" "Own your data" "A network you control"; do
  if grep -F -q "$s" /tmp/land.js; then echo "FOUND: $s"; else echo "MISSING: $s"; fi
done
