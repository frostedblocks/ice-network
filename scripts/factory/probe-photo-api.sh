#!/bin/bash
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ice-network
dfx identity use mynewdeploy
echo "wasm size on factory:"
dfx canister call factory getWasmSize --network ic --query
echo "beginChunkedUpload as dfx (expect Only owner):"
dfx canister call sll2h-yaaaa-aaaas-qgxta-cai beginChunkedUpload '("image/jpeg", 2000000:nat, 4:nat)' --network ic || true
echo "quota:"
dfx canister call sll2h-yaaaa-aaaas-qgxta-cai getPhotoQuota --network ic --query
echo "module:"
dfx canister info sll2h-yaaaa-aaaas-qgxta-cai --network ic
# Compare module hash of built wasm
sha256sum .dfx/ic/canisters/user_site/user_site.wasm || shasum -a 256 .dfx/ic/canisters/user_site/user_site.wasm
