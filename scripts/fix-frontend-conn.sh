#!/bin/bash
set -e
export PATH="$HOME/.local/share/dfx/bin:/usr/bin:/bin:$PATH"
HOME_PROJ="$HOME/ScaleSpace"
cp /mnt/c/Users/walt_/ScaleSpace/frontend/src/actors.js "$HOME_PROJ/frontend/src/actors.js"
cp /mnt/c/Users/walt_/ScaleSpace/frontend/vite.config.js "$HOME_PROJ/frontend/vite.config.js"
cd "$HOME_PROJ"
dfx generate ice
dfx generate messaging
echo "=== declarations ==="
ls -la frontend/src/declarations/ice/
ls -la frontend/src/declarations/messaging/
echo "=== env.local ==="
cat frontend/.env.local || true
echo "=== canister_ids ==="
cat .dfx/local/canister_ids.json
python3 - <<'PY'
import json, pathlib
ids = json.loads(pathlib.Path(".dfx/local/canister_ids.json").read_text())
lines = [
    "# DFX CANISTER ENVIRONMENT VARIABLES",
    "DFX_NETWORK=local",
    f"CANISTER_ID_ICE={ids['ice']['local']}",
    f"CANISTER_ID_MESSAGING={ids['messaging']['local']}",
    "# END DFX CANISTER ENVIRONMENT VARIABLES",
]
pathlib.Path("frontend/.env.local").write_text("\n".join(lines) + "\n")
print("wrote frontend/.env.local")
print(open("frontend/.env.local").read())
PY
echo "OK - restart npm run dev"
