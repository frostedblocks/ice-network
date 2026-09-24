#!/bin/bash
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy
echo "Principal: $(dfx identity get-principal)"
echo -n "Ledger ICP: "
dfx ledger balance --network ic
echo -n "Cycles: "
dfx cycles balance --network ic
