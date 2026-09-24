#!/bin/bash
# Sync personal hosting domains from factory into:
#   - frontend/public/.well-known/ic-domains
#   - frontend/public/.well-known/ii-alternative-origins  (max 10 entries)
# then redeploy assets.
#
# Usage:
#   bash scripts/sync-hosting-domains.sh
#   bash scripts/sync-hosting-domains.sh --register mysite.example.com
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh" 2>/dev/null || true
nvm use 20 2>/dev/null || true

WIN="/mnt/c/Users/walt_/ScaleSpace"
PROJ="/home/walt_wood1/ScaleSpace"
ICE="/home/walt_wood1/ice-network"
ASSETS_ID="6hhqv-baaaa-aaaan-q6mxq-cai"

REGISTER_DOMAIN=""
if [[ "${1:-}" == "--register" && -n "${2:-}" ]]; then
  REGISTER_DOMAIN="$2"
fi

cd "$ICE"
dfx identity use mynewdeploy

echo "=== getIcDomainsFileBody ==="
python3 - <<'PY'
import re, subprocess, pathlib, json

def call(method):
    out = subprocess.check_output(
        ["dfx", "canister", "call", "factory", method, "--network", "ic", "--query"],
        text=True,
    )
    return out

raw = call("getIcDomainsFileBody")
m = re.search(r'\("([\s\S]*)"\)\s*$', raw.strip())
if not m:
    # try single-line
    m = re.search(r'\("([\s\S]*)"\)', raw)
if not m:
    raise SystemExit(f"parse fail getIcDomainsFileBody: {raw!r}")
body = m.group(1).encode("utf-8").decode("unicode_escape")
if not body.endswith("\n"):
    body += "\n"

# Domains list for II alternative origins (max 10)
domains = [ln.strip() for ln in body.splitlines() if ln.strip() and not ln.strip().startswith("#")]
# Prefer main brand domains first, then personal (cap at 10)
brand = [d for d in domains if d in ("frostedblocks.com", "www.frostedblocks.com")]
other = [d for d in domains if d not in brand]
ordered = brand + other
# II max 10 alternative origins
ordered = ordered[:10]
alts = [f"https://{d}" for d in ordered]
ii = {"alternativeOrigins": alts}

win = pathlib.Path("/mnt/c/Users/walt_/ScaleSpace/frontend/public/.well-known")
proj = pathlib.Path("/home/walt_wood1/ScaleSpace/frontend/public/.well-known")
for base in (win, proj):
    base.mkdir(parents=True, exist_ok=True)
    (base / "ic-domains").write_text(body, encoding="utf-8")
    (base / "ii-alternative-origins").write_text(
        json.dumps(ii, indent=2) + "\n", encoding="utf-8"
    )

print("--- ic-domains ---")
print(body, end="")
print("--- ii-alternative-origins ---")
print(json.dumps(ii, indent=2))
print(f"wrote {win} and {proj}")
PY

echo "=== Redeploy assets ==="
bash /mnt/c/Users/walt_/ScaleSpace/scripts/deploy-assets-only.sh

if [[ -n "$REGISTER_DOMAIN" ]]; then
  echo "=== Validate + register $REGISTER_DOMAIN ==="
  curl -sL "https://icp0.io/custom-domains/v1/${REGISTER_DOMAIN}/validate" || true
  echo
  curl -sL -X POST "https://icp0.io/custom-domains/v1/${REGISTER_DOMAIN}" || true
  echo
  curl -sL "https://icp0.io/custom-domains/v1/${REGISTER_DOMAIN}" || true
  echo
fi

echo "Assets: $ASSETS_ID"
echo "DONE"
