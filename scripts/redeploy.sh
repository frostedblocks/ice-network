#!/bin/bash
set -e
export PATH="$HOME/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
if [ -x "$HOME/.local/share/dfx/versions/0.29.2/dfx" ]; then
  dfxvm default 0.29.2 >/dev/null 2>&1 || true
fi
hash -r
echo "dfx: $(dfx --version)"

pkill -9 -x dfx 2>/dev/null || true
pkill -9 -x pocket-ic 2>/dev/null || true
sleep 1

# Project lives at ~/ScaleSpace (repo folder name) until renamed on disk
cd "$HOME/ScaleSpace"

if ! dfx ping >/dev/null 2>&1; then
  dfx start --background --clean
  sleep 3
fi

dfx ping
echo "=== deploy ice ==="
dfx deploy ice
echo "=== deploy messaging ==="
dfx deploy messaging
echo "=== generate ==="
dfx generate ice || true
dfx generate messaging || true
ls -la frontend/src/declarations 2>/dev/null || true
dfx canister status ice | head -15
echo DONE
