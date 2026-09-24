#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:/home/walt_wood1/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity

BACKEND_ID="xfwx3-7yaaa-aaaas-qgxpq-cai"
FRONTEND_ID="sznn6-uqaaa-aaaas-qgxqa-cai"
AMOUNT="1.2"

dfx identity use mynewdeploy

echo "=== BEFORE ==="
dfx ledger balance --network ic
dfx cycles balance --network ic

echo "=== TOP-UP Master Factory ($BACKEND_ID) with ${AMOUNT} ICP ==="
dfx ledger top-up "$BACKEND_ID" --amount "$AMOUNT" --network ic

echo "=== TOP-UP User_Site ($FRONTEND_ID) with ${AMOUNT} ICP ==="
dfx ledger top-up "$FRONTEND_ID" --amount "$AMOUNT" --network ic

echo "=== AFTER TOP-UP (balances) ==="
dfx ledger balance --network ic
dfx cycles balance --network ic

echo "=== STATUS Master Factory ==="
dfx canister status "$BACKEND_ID" --network ic

echo "=== STATUS User_Site ==="
dfx canister status "$FRONTEND_ID" --network ic

# Rename in local project configs (dfx keys cannot contain spaces)
PROJ="/home/walt_wood1/frosted-blocks"
cd "$PROJ"

# Rewrite dfx.json with new names; keep ids via canister_ids.json
cat > dfx.json <<'EOF'
{
  "version": 1,
  "canisters": {
    "Master_Factory": {
      "main": "backend/main.mo",
      "type": "motoko"
    },
    "User_Site": {
      "dependencies": ["Master_Factory"],
      "frontend": {
        "entrypoint": "dist/index.html"
      },
      "source": ["dist"],
      "type": "assets"
    }
  },
  "defaults": {
    "build": {
      "args": "",
      "packtool": ""
    }
  },
  "output_env_file": ".env"
}
EOF

mkdir -p .dfx/ic
cat > canister_ids.json <<EOF
{
  "Master_Factory": { "ic": "$BACKEND_ID" },
  "User_Site": { "ic": "$FRONTEND_ID" }
}
EOF

# Also write under .dfx/ic if present
cat > .dfx/ic/canister_ids.json <<EOF
{
  "Master_Factory": { "ic": "$BACKEND_ID" },
  "User_Site": { "ic": "$FRONTEND_ID" }
}
EOF

# Display-name map for humans / NNS notes
cat > CANISTER_NAMES.md <<EOF
# Canister names (display)

| Display name   | dfx name         | Canister ID |
|----------------|------------------|-------------|
| Master Factory | Master_Factory   | $BACKEND_ID |
| User_Site      | User_Site        | $FRONTEND_ID |

On-chain canisters do not store a display name; NNS "name" is local to your NNS account.
In NNS: open each canister and set the name to **Master Factory** / **User_Site**.
EOF

# Mirror to Windows
WIN="/mnt/c/Users/walt_/frosted-blocks"
mkdir -p "$WIN"
cp -f dfx.json "$WIN/dfx.json"
cp -f canister_ids.json "$WIN/canister_ids.json"
cp -f CANISTER_NAMES.md "$WIN/CANISTER_NAMES.md"

# Also note under ScaleSpace for reference
SS="/mnt/c/Users/walt_/ScaleSpace"
cat > "$SS/NEW_CANISTERS.md" <<EOF
# New canisters (empty — no app installed)

| Display name   | Canister ID | Controllers include |
|----------------|-------------|---------------------|
| Master Factory | $BACKEND_ID | gmtr2-… + mynewdeploy |
| User_Site      | $FRONTEND_ID | gmtr2-… + mynewdeploy |

Topped up: 1.2 ICP → cycles each via \`dfx ledger top-up\`.
EOF

echo "=== VERIFY IDs ==="
dfx canister id Master_Factory --network ic
dfx canister id User_Site --network ic

echo "DONE"
