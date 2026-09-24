#!/bin/bash
# Build a canister-labeled mirror of frostedblocks.com + factory cluster,
# then push to github.com/frostedblocks/ice-network
set -euo pipefail

SCALE="/mnt/c/Users/walt_/ScaleSpace"
FACTORY="/mnt/c/Users/walt_/ice-network"
OUT="/mnt/c/Users/walt_/ice-network-github-export"
REMOTE="https://github.com/frostedblocks/ice-network.git"

rm -rf "$OUT"
mkdir -p "$OUT"

# --- Root index ---
cat > "$OUT/README.md" <<'EOF'
# ICE Network (frostedblocks.com)

Full on-chain ICE stack, organized **by canister name**.

| Canister name | Mainnet ID | Role |
|---|---|---|
| **ice** | `6jf55-2qaaa-aaaan-q6mwq-cai` | Social backend (posts, profiles, tips, referrals, LiteAdmin) |
| **messaging** | `6agwb-myaaa-aaaan-q6mxa-cai` | Direct messages |
| **assets** | `6hhqv-baaaa-aaaan-q6mxq-cai` | Frontend (frostedblocks.com) |
| **factory** | `xfwx3-7yaaa-aaaas-qgxpq-cai` | Personal site mint / cycles / transfers |
| **registry** | `tihtb-myaaa-aaaas-qgxvq-cai` | Domain → site registry |
| **user_site** | `sznn6-uqaaa-aaaas-qgxqa-cai` | User-site WASM template (minted copies) |

Brand URL: https://frostedblocks.com  
Lite (Web2 door): https://lite.frostedblocks.com (separate repo: `frostedblocks-lite`)

## Layout

```
ice/           Motoko source for ice canister
messaging/     Motoko source for messaging canister
assets/        Frontend (Vite/React) → assets canister
factory/       Motoko factory
registry/      Motoko registry
user_site/     Motoko user-site template
scripts/       Deploy / ops scripts
docs/          Domain, launch, registry notes
canister_ids.json
```

Each canister folder includes a `CANISTER.md` with its mainnet ID.
EOF

cat > "$OUT/canister_ids.json" <<'EOF'
{
  "ice": { "ic": "6jf55-2qaaa-aaaan-q6mwq-cai" },
  "messaging": { "ic": "6agwb-myaaa-aaaan-q6mxa-cai" },
  "assets": { "ic": "6hhqv-baaaa-aaaan-q6mxq-cai" },
  "factory": { "ic": "xfwx3-7yaaa-aaaas-qgxpq-cai" },
  "registry": { "ic": "tihtb-myaaa-aaaas-qgxvq-cai" },
  "user_site": { "ic": "sznn6-uqaaa-aaaas-qgxqa-cai" }
}
EOF

# --- ice ---
mkdir -p "$OUT/ice"
cp -f "$SCALE/backend/main.mo" "$OUT/ice/main.mo"
cat > "$OUT/ice/CANISTER.md" <<'EOF'
# ice

- **Name:** ice
- **Mainnet ID:** `6jf55-2qaaa-aaaan-q6mwq-cai`
- **Source:** `main.mo`
- **App:** frostedblocks.com social backend
EOF

# --- messaging ---
mkdir -p "$OUT/messaging"
cp -f "$SCALE/messaging/main.mo" "$OUT/messaging/main.mo"
cat > "$OUT/messaging/CANISTER.md" <<'EOF'
# messaging

- **Name:** messaging
- **Mainnet ID:** `6agwb-myaaa-aaaan-q6mxa-cai`
- **Source:** `main.mo`
EOF

# --- assets (frontend) ---
mkdir -p "$OUT/assets"
# copy frontend without node_modules / dist / env (no rsync required)
cp -rf "$SCALE/frontend/." "$OUT/assets/"
rm -rf "$OUT/assets/node_modules" "$OUT/assets/dist" \
  "$OUT/assets/.env" "$OUT/assets/.env.local" "$OUT/assets/.env.production" 2>/dev/null || true
# Keep declarations if present (useful for consumers)
if [ -d "$SCALE/frontend/src/declarations" ]; then
  mkdir -p "$OUT/assets/src/declarations"
  cp -rf "$SCALE/frontend/src/declarations/." "$OUT/assets/src/declarations/" 2>/dev/null || true
fi
cat > "$OUT/assets/CANISTER.md" <<'EOF'
# assets

- **Name:** assets
- **Mainnet ID:** `6hhqv-baaaa-aaaan-q6mxq-cai`
- **Source:** this folder (Vite build → `dist/` → dfx assets canister)
- **Brand:** https://frostedblocks.com
EOF

# --- factory / registry / user_site ---
for c in factory registry user_site; do
  mkdir -p "$OUT/$c"
  if [ -f "$FACTORY/src/$c/main.mo" ]; then
    cp -f "$FACTORY/src/$c/main.mo" "$OUT/$c/main.mo"
  elif [ -f "/home/walt_wood1/ice-network/src/$c/main.mo" ]; then
    cp -f "/home/walt_wood1/ice-network/src/$c/main.mo" "$OUT/$c/main.mo"
  fi
done

cat > "$OUT/factory/CANISTER.md" <<'EOF'
# factory

- **Name:** factory
- **Mainnet ID:** `xfwx3-7yaaa-aaaas-qgxpq-cai`
- **Source:** `main.mo`
- **Role:** mint personal sites, cycles, transfers, recovery
EOF

cat > "$OUT/registry/CANISTER.md" <<'EOF'
# registry

- **Name:** registry
- **Mainnet ID:** `tihtb-myaaa-aaaas-qgxvq-cai`
- **Source:** `main.mo`
- **Role:** custom domain → personal site mapping
EOF

cat > "$OUT/user_site/CANISTER.md" <<'EOF'
# user_site

- **Name:** user_site (template)
- **Mainnet ID (template/example):** `sznn6-uqaaa-aaaas-qgxqa-cai`
- **Source:** `main.mo`
- **Role:** WASM template cloned for each personal site mint
EOF

# --- docs ---
mkdir -p "$OUT/docs"
for f in DOMAIN.md LAUNCH.md MASTER_USER_SITE.md NEW_CANISTERS.md README.md; do
  [ -f "$SCALE/$f" ] && cp -f "$SCALE/$f" "$OUT/docs/$f" || true
done
for f in FIX_PLAN.md REGISTRY_AND_DETACH.md README.md; do
  [ -f "$FACTORY/$f" ] && cp -f "$FACTORY/$f" "$OUT/docs/factory-$f" || true
done

# --- scripts (useful only; skip huge JSON push payloads) ---
mkdir -p "$OUT/scripts"
if [ -d "$SCALE/scripts" ]; then
  find "$SCALE/scripts" -maxdepth 1 -type f \( -name '*.sh' -o -name '*.js' -o -name '*.md' \) \
    ! -name '_lite-*' ! -name '_pack*' ! -name '_verify*' ! -name '_build*' ! -name '_tsc*' \
    ! -name '_list*' ! -name '_compare*' ! -name '_check*' ! -name '_append*' ! -name '_local*' \
    -exec cp -f {} "$OUT/scripts/" \;
fi
if [ -d "$FACTORY/scripts" ]; then
  mkdir -p "$OUT/scripts/factory"
  cp -f "$FACTORY/scripts/"*.sh "$OUT/scripts/factory/" 2>/dev/null || true
fi

# Root dfx helpers (two projects documented)
cp -f "$SCALE/dfx.json" "$OUT/dfx.scalespace.json"
cp -f "$FACTORY/dfx.json" "$OUT/dfx.factory.json" 2>/dev/null || true

cat > "$OUT/.gitignore" <<'EOF'
.dfx/
node_modules/
assets/node_modules/
assets/dist/
assets/.env
assets/.env.local
assets/.env.production
*.wasm
*.wasm.gz
.idea/
.vscode/
EOF

echo "=== export tree ==="
find "$OUT" -type f | wc -l
du -sh "$OUT"

# --- git push ---
cd "$OUT"
git init -b main
git config user.email "walt@frostedblocks.com"
git config user.name "frostedblocks"
git add -A
git status --short | head -50
echo "...(truncated)..."
git status --short | wc -l
git commit -m "Import full frostedblocks.com stack labeled by canister (ice, messaging, assets, factory, registry, user_site)"

# Prefer gh if available; else HTTPS push (may need auth)
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "Using gh to push..."
  gh repo sync frostedblocks/ice-network --source . 2>/dev/null || true
  git remote add origin "$REMOTE"
  git push -u origin main --force
else
  echo "Using git push --force to $REMOTE"
  git remote add origin "$REMOTE"
  GIT_TERMINAL_PROMPT=0 git push -u origin main --force
fi

echo "DONE https://github.com/frostedblocks/ice-network"
