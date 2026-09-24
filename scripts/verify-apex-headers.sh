#!/bin/bash
set -euo pipefail
for url in \
  "https://frostedblocks.com/" \
  "https://frostedblocks.com/about.html" \
  "https://www.frostedblocks.com/about.html"
do
  echo "==== $url"
  curl -sI "$url" | tr -d '\r' | head -20
  echo
done
