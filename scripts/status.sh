#!/bin/bash
export PATH="/home/walt_wood1/.nvm/versions/node/v20.20.2/bin:/home/walt_wood1/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
echo "=== tools ==="
node -v 2>&1
npm -v 2>&1
dfx --version 2>&1
echo "=== processes ==="
ps aux 2>/dev/null | grep -E 'setup|dfx|replica|npm' | grep -v grep || echo none
echo "=== project ==="
ls -la /home/walt_wood1/ScaleSpace/ 2>&1 | head -20
echo "=== .dfx ==="
ls -la /home/walt_wood1/ScaleSpace/.dfx 2>&1 | head -15
echo "=== declarations ==="
ls /home/walt_wood1/ScaleSpace/frontend/src/declarations 2>&1
echo "=== env ==="
cat /home/walt_wood1/ScaleSpace/frontend/.env.local 2>&1
echo "=== node_modules dfinity ==="
ls /home/walt_wood1/ScaleSpace/frontend/node_modules/@dfinity 2>&1 | head -10
echo "=== ping ==="
timeout 5 dfx ping 2>&1 || echo "replica not responding"
