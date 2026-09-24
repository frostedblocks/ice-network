#!/bin/bash
set -euo pipefail
cd /mnt/c/Users/walt_/frostedblocks-lite
git add -A
git -c user.email=ops@frostedblocks.com -c user.name="ICE Lite Ops" commit -m "feat: enforce ICE LiteAdmin lock on server routes"
git push origin main
echo DONE
