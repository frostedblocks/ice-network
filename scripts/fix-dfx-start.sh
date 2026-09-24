#!/bin/bash
export PATH="$HOME/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
export RUST_LOG=info

# Kill only real binaries, not this script
pkill -9 -x dfx 2>/dev/null || true
pkill -9 -x pocket-ic 2>/dev/null || true
sleep 2

cd "$HOME/ScaleSpace" || exit 1
rm -rf .dfx

echo "=== date ==="
date -u

echo "=== dfx versions ==="
dfxvm list
dfx --version

echo "=== try 0.32.0 for 45s ==="
timeout 45 "$HOME/.local/share/dfx/versions/0.32.0/dfx" start --clean 2>&1 | tail -40
echo "exit32: $?"

pkill -9 -x dfx 2>/dev/null || true
pkill -9 -x pocket-ic 2>/dev/null || true
sleep 2
rm -rf .dfx

echo "=== try 0.29.2 for 90s background ==="
"$HOME/.local/share/dfx/versions/0.29.2/dfx" start --background --clean 2>&1
echo "exit292: $?"
sleep 5
"$HOME/.local/share/dfx/versions/0.29.2/dfx" ping 2>&1 || true
"$HOME/.local/share/dfx/versions/0.29.2/dfx" stop 2>&1 || true
