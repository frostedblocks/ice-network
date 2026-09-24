#!/bin/bash
export PATH="$HOME/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
cd "$HOME/ScaleSpace"
II=$(dfx canister id internet_identity)
echo "II=$II"
echo "=== ping ==="
dfx ping | head -c 80; echo

echo "=== curl raw.localhost Host header ==="
curl -sS -D- -o /tmp/ii1.txt -H "Host: ${II}.raw.localhost" "http://127.0.0.1:4943/" | head -20
echo "body1:"; head -c 300 /tmp/ii1.txt; echo

echo "=== curl .localhost Host header ==="
curl -sS -D- -o /tmp/ii2.txt -H "Host: ${II}.localhost" "http://127.0.0.1:4943/" | head -20
echo "body2:"; head -c 300 /tmp/ii2.txt; echo

echo "=== curl canisterId query ==="
curl -sS -D- -o /tmp/ii3.txt "http://127.0.0.1:4943/?canisterId=${II}" | head -20
echo "body3:"; head -c 300 /tmp/ii3.txt; echo

echo "=== ic http_request via dfx ==="
dfx canister call internet_identity http_request '(record { url = "/"; method = "GET"; body = vec {}; headers = vec {}; certificate_version = opt (2 : nat16) })' 2>&1 | head -40
