#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
P=$(dfx identity get-principal --identity mynewdeploy)
echo "dfx=[$P] len=${#P}"
python3 <<'PY'
from pathlib import Path
p = Path("/mnt/c/Users/walt_/ScaleSpace/messaging/main.mo").read_text(encoding="utf-8")
import re, subprocess
dfx = subprocess.check_output(["dfx","identity","get-principal","--identity","mynewdeploy"], text=True).strip()
print("dfx", dfx, len(dfx))
for x in re.findall(r'Principal\.fromText\("([^"]+)"\)', p):
    if "vm63y" in x or x.startswith("gmtr2"):
        print("src", x, len(x), "eq" if x == dfx else "NE", "".join(f"{ord(c):x}." for c in x[:10]))
PY

# Force redeploy with explicit copy and show moc isn't using stale
cp -f /mnt/c/Users/walt_/ScaleSpace/messaging/main.mo /home/walt_wood1/ScaleSpace/messaging/main.mo
grep -n "vm63y" /home/walt_wood1/ScaleSpace/messaging/main.mo
cd /home/walt_wood1/ScaleSpace
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy
dfx deploy messaging --network ic --yes

echo "=== after redeploy ==="
TOKEN="DbgMasterReplyTok003"
CIPHER="ice1:AAAAAAAAAAAAAAAAAAAAdebugcipherpayload03"
RES=$(dfx canister call messaging startOrContinueGuestChat "(\"$TOKEN\", \"\", \"$CIPHER\")" --network ic)
echo "$RES"
CID=$(echo "$RES" | sed -n 's/.*conversationId = \([0-9_]*\).*/\1/p' | tr -d '_' | head -1)
echo "cid=$CID"
dfx canister call messaging listOpenGuestThreads --network ic
dfx canister call messaging getGuestThreadToken "($CID)" --network ic
dfx canister call messaging sendMessage "($CID, \"founder reply after redeploy\")" --network ic
