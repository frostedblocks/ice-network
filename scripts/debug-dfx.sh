#!/bin/bash
export PATH="$HOME/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
echo "=== processes ==="
ps aux | grep -E 'dfx|pocket|replica' | grep -v grep || echo none
echo "=== dfx version ==="
dfx --version
dfxvm list 2>&1 || true
echo "=== cache ==="
ls -la "$HOME/.cache/dfinity/" 2>&1 | head -20
find "$HOME/.cache/dfinity" -maxdepth 3 -type d 2>/dev/null | head -40
echo "=== .dfx network ==="
ls -la "$HOME/ScaleSpace/.dfx/network" 2>&1 | head -20
find "$HOME/ScaleSpace/.dfx" -type f 2>/dev/null | head -30
echo "=== config ==="
cat "$HOME/.config/dfx/networks.json" 2>&1 || true
cat "$HOME/.config/dfx/config.json" 2>&1 || true
echo "=== uname ==="
uname -a
cat /proc/sys/fs/inotify/max_user_watches 2>/dev/null || true
echo "=== ports ==="
ss -ltnp 2>/dev/null | head -30 || netstat -ltnp 2>/dev/null | head -30 || true
