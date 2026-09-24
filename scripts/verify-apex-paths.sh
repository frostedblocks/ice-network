#!/bin/bash
set -euo pipefail
for url in \
  "https://frostedblocks.com/about.html" \
  "https://frostedblocks.com/how-to-join.html" \
  "https://frostedblocks.com/partners.html" \
  "https://www.frostedblocks.com/about" \
  "https://www.frostedblocks.com/how-to-join" \
  "https://www.frostedblocks.com/partners" \
  "https://frostedblocks.com/" \
  "https://www.frostedblocks.com/"
do
  code=$(curl -sL -o /tmp/u.html -w "%{http_code}" "$url" || echo 000)
  final=$(curl -sI "$url" 2>/dev/null | tr -d '\r' | grep -i '^location:' | head -1 || true)
  echo "$code  $url  $final"
done
