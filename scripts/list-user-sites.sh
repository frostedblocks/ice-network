#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20 >/dev/null
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"
dfx identity use mynewdeploy >/dev/null

FACTORY="xfwx3-7yaaa-aaaas-qgxpq-cai"
ICE="6jf55-2qaaa-aaaan-q6mwq-cai"

echo "=== listRegisteredSites ==="
dfx canister call "$FACTORY" listRegisteredSites --network ic --query

echo ""
echo "=== Per-user profile + getUserCanister ==="
# Parse principals from listRegisteredSites output roughly via a second call saved to file
dfx canister call "$FACTORY" listRegisteredSites --network ic --query > /tmp/sites.txt
# Extract principal lines that look like user principals (not canister ids ending -cai typically both do)
# Better: use python to parse candid-ish text
python3 - <<'PY'
import re, subprocess, os
text=open("/tmp/sites.txt").read()
# records look like: principal "user"; principal "site"; true/false;
pairs=re.findall(r'principal "([^"]+)";\s*principal "([^"]+)";\s*(true|false)', text)
print(f"found {len(pairs)} linked sites\n")
for user, site, active in pairs:
    print("="*60)
    print(f"USER II:  {user}")
    print(f"SITE:     {site}")
    print(f"ACTIVE:   {active}")
    # username
    try:
        out=subprocess.check_output([
            "dfx","canister","call","6jf55-2qaaa-aaaan-q6mwq-cai","getProfile",
            f'(principal "{user}")',"--network","ic","--query"
        ], text=True, stderr=subprocess.STDOUT)
        m=re.search(r'username\s*=\s*"([^"]*)"', out)
        bio=re.search(r'bio\s*=\s*"([^"]*)"', out)
        print(f"USERNAME: {m.group(1) if m else '(none/opt empty)'}")
        if bio and bio.group(1):
            print(f"BIO:      {bio.group(1)[:80]}")
    except Exception as e:
        print(f"USERNAME: (lookup failed) {e}")
    # registered?
    try:
        out=subprocess.check_output([
            "dfx","canister","call","6jf55-2qaaa-aaaan-q6mwq-cai","isRegistered",
            f'(principal "{user}")',"--network","ic","--query"
        ], text=True, stderr=subprocess.STDOUT).strip()
        print(f"ICE REG:  {out}")
    except Exception as e:
        print(f"ICE REG:  (failed) {e}")
    # controllers
    try:
        out=subprocess.check_output([
            "dfx","canister","--network","ic","status",site
        ], text=True, stderr=subprocess.STDOUT)
        for line in out.splitlines():
            if line.strip().startswith("Controllers:"):
                print(line.strip())
    except Exception as e:
        print(f"Controllers: (failed) {e}")
    print()
PY
