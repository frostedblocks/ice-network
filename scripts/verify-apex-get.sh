#!/bin/bash
set -euo pipefail
for url in \
  "https://frostedblocks.com/about.html" \
  "https://frostedblocks.com/about" \
  "https://frostedblocks.com/how-to-join" \
  "https://www.frostedblocks.com/about"
do
  code=$(curl -sL -o /tmp/body.html -w "%{http_code}" "$url")
  bytes=$(wc -c </tmp/body.html)
  title=$(grep -o '<title>[^<]*' /tmp/body.html | head -1 || true)
  echo "$code bytes=$bytes $url | $title"
done
