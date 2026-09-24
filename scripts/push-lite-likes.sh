#!/bin/bash
set -euo pipefail
cd /mnt/c/Users/walt_/frostedblocks-lite
git add -A
git -c user.email=ops@frostedblocks.com -c user.name="ICE Lite Ops" commit -m "feat: Lite users can like bridged ICE Network posts" || true
git push origin main
echo DONE
