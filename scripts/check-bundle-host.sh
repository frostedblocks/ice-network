#!/bin/bash
set -euo pipefail
f=/tmp/ice-bundle.js
echo "icp-api count: $(grep -c 'icp-api.io' "$f" || true)"
echo "localhost4943 count: $(grep -c '127.0.0.1:4943' "$f" || true)"
echo "6agwb messaging id count: $(grep -c '6agwb-myaaa-aaaan-q6mxa-cai' "$f" || true)"
# show a short context around icp-api
grep -o 'https://icp-api.io' "$f" | head -3 || true
