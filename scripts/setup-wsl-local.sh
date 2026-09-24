#!/bin/bash
# I.C.E. local ICP setup for Ubuntu/WSL (no sudo required)
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:${HOME}/.local/bin:${HOME}/.local/share/dfx/bin:${PATH}"
export NVM_DIR="${HOME}/.nvm"
if [ -s "${NVM_DIR}/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "${NVM_DIR}/nvm.sh"
fi

echo "=== Install Node 20 via nvm ==="
if ! command -v nvm >/dev/null 2>&1 && [ ! -s "${NVM_DIR}/nvm.sh" ]; then
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
  # shellcheck source=/dev/null
  . "${NVM_DIR}/nvm.sh"
fi
nvm install 20
nvm use 20
hash -r
echo "node: $(node -v) at $(command -v node)"
echo "npm: $(npm -v) at $(command -v npm)"

echo "=== Install dfx ==="
if ! command -v dfx >/dev/null 2>&1; then
  export DFXVM_INIT_YES=true
  curl -fsSL https://internetcomputer.org/install.sh -o /tmp/dfx_install.sh
  bash /tmp/dfx_install.sh
fi
if [ -f "${HOME}/.local/share/dfx/env" ]; then
  # shellcheck source=/dev/null
  . "${HOME}/.local/share/dfx/env"
fi
export PATH="${HOME}/.local/share/dfx/bin:${PATH}"
hash -r
echo "dfx: $(dfx --version) at $(command -v dfx)"
dfxvm default 0.29.2 2>/dev/null || true

echo "=== Project on Linux filesystem ==="
# Repo folder may still be named ScaleSpace on disk
PROJECT="${HOME}/ScaleSpace"
SRC_WIN="/mnt/c/Users/walt_/ScaleSpace"
if [ ! -f "${PROJECT}/dfx.json" ]; then
  if [ -f "${SRC_WIN}/dfx.json" ]; then
    rm -rf "${PROJECT}"
    mkdir -p "${PROJECT}"
    cp -a "${SRC_WIN}/." "${PROJECT}/"
    rm -rf "${PROJECT}/node_modules" "${PROJECT}/frontend/node_modules" "${PROJECT}/.dfx" 2>/dev/null || true
  else
    git clone https://github.com/frostedblocks/ScaleSpace.git "${PROJECT}"
  fi
fi
cd "${PROJECT}"
echo "Project at: $(pwd)"

echo "=== npm install frontend ==="
cd "${PROJECT}/frontend"
npm install

echo "=== Start local replica and deploy ==="
cd "${PROJECT}"
dfx stop 2>/dev/null || true
dfx start --background --clean
for i in $(seq 1 30); do
  if dfx ping >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
dfx deploy ice
dfx deploy messaging

echo "=== Results ==="
echo "ice: $(dfx canister id ice)"
echo "messaging:  $(dfx canister id messaging)"
if [ -f frontend/.env.local ]; then
  cat frontend/.env.local
fi

echo ""
echo "=== SETUP COMPLETE (I.C.E.) ==="
echo "  cd ${PROJECT}"
echo "  dfx start --background"
echo "  cd frontend && npm run dev"
