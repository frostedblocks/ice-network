#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
export NVM_DIR="/home/walt_wood1/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 20
export PATH="/home/walt_wood1/.local/share/dfx/bin:$PATH"
dfx identity use mynewdeploy

cd /home/walt_wood1/ScaleSpace
# ensure dist exists from prior build
if [ ! -f frontend/dist/index.html ]; then
  cd frontend
  DFX_NETWORK=ic \
    CANISTER_ID_ICE=6jf55-2qaaa-aaaan-q6mwq-cai \
    CANISTER_ID_MESSAGING=6agwb-myaaa-aaaan-q6mxa-cai \
    VITE_CANISTER_ID_FACTORY=xfwx3-7yaaa-aaaas-qgxpq-cai \
    npm run build
  cd ..
fi
dfx deploy assets --network ic --yes

cd /home/walt_wood1/ice-network
dfx canister call factory getFees --network ic --query
echo DONE
