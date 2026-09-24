#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"

for C in sxpaw-paaaa-aaaas-qgxra-cai sqogc-cyaaa-aaaas-qgxrq-cai sfjxp-dqaaa-aaaas-qgxsa-cai; do
  echo "======== $C ========"
  dfx canister info "$C" --network ic 2>&1 || true
  echo "owner (if user_site):"
  dfx canister call "$C" getOwner --network ic 2>&1 || true
  echo
done
