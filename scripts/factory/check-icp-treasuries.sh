#!/bin/bash
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy

echo "=== Join fee (ICE economy) ==="
dfx canister call 6jf55-2qaaa-aaaan-q6mwq-cai getRegistrationFeeE8s --network ic --query
dfx canister call 6jf55-2qaaa-aaaan-q6mwq-cai getEconomyConfig --network ic --query
dfx canister call 6jf55-2qaaa-aaaan-q6mwq-cai getTreasuryStats --network ic --query

echo ""
echo "=== ICP balances (ledger) ==="
for p in \
  "6jf55-2qaaa-aaaan-q6mwq-cai" \
  "xfwx3-7yaaa-aaaas-qgxpq-cai" \
  "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae"
do
  echo -n "$p: "
  dfx ledger balance --of-principal "$p" --network ic 2>&1
done
echo -n "dfx mynewdeploy: "
dfx ledger balance --network ic
