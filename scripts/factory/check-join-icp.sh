#!/bin/bash
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy

ICE=6jf55-2qaaa-aaaan-q6mwq-cai
FACTORY=xfwx3-7yaaa-aaaas-qgxpq-cai
OWNER=gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae

echo "=== Registration fee (from ICE) ==="
dfx canister call $ICE getRegistrationFeeE8s --network ic --query 2>&1 || true
dfx canister call $ICE getRegistrationConfig --network ic --query 2>&1 || true
dfx canister call $ICE isRegistrationFeeEnabled --network ic --query 2>&1 || true
dfx canister call $ICE getTreasuryStats --network ic --query 2>&1 || true
dfx canister call $ICE getOwner --network ic --query 2>&1 || true

echo "=== ICP ledger balances ==="
echo -n "ICE canister ($ICE): "
dfx ledger balance --of $ICE --network ic 2>&1
echo -n "Factory ($FACTORY): "
dfx ledger balance --of $FACTORY --network ic 2>&1
echo -n "Owner gmtr2: "
dfx ledger balance --of $OWNER --network ic 2>&1
echo -n "DFX mynewdeploy: "
dfx ledger balance --network ic 2>&1
