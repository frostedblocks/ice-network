#!/bin/bash
export PATH="/usr/bin:/bin:/home/walt_wood1/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy

ids=(
  "xfwx3-7yaaa-aaaas-qgxpq-cai:Master_Factory"
  "sznn6-uqaaa-aaaas-qgxqa-cai:User_Site_template"
  "sxpaw-paaaa-aaaas-qgxra-cai:personal_site"
  "6jf55-2qaaa-aaaan-q6mwq-cai:ice_backend"
  "6agwb-myaaa-aaaan-q6mxa-cai:messaging"
  "6hhqv-baaaa-aaaan-q6mxq-cai:assets"
)

for entry in "${ids[@]}"; do
  id="${entry%%:*}"
  name="${entry##*:}"
  echo "==== $name ($id) ===="
  dfx canister status "$id" --network ic 2>&1 | grep -E "Memory Size|Module hash|Balance|Status:"
  echo
done

echo "==== factory stored user_site WASM ===="
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai getWasmSize --network ic 2>&1
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai getWasmMagicHex --network ic 2>&1
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai health --network ic 2>&1
