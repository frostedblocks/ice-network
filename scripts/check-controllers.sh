#!/bin/bash
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"
for C in tgf6j-xiaaa-aaaas-qgxuq-cai scir3-oiaaa-aaaas-qgxsq-cai sxpaw-paaaa-aaaas-qgxra-cai sll2h-yaaaa-aaaas-qgxta-cai; do
  echo "======== $C ========"
  dfx canister info "$C" --network ic 2>&1 | head -5
  echo
done
