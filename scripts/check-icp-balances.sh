#!/bin/bash
set -euo pipefail
export DFX_WARNING=-mainnet_plaintext_identity
export PATH="$HOME/.local/share/dfx/bin:$PATH"

echo "=== dfx identity ==="
dfx identity whoami
PRIN=$(dfx identity get-principal)
echo "principal: $PRIN"
echo -n "dfx ledger balance: "
dfx ledger --network ic balance

check() {
  local label="$1"
  local p="$2"
  echo -n "$label: "
  dfx canister --network ic call ryjl3-tyaaa-aaaaa-aaaba-cai icrc1_balance_of \
    "(record { owner = principal \"$p\"; subaccount = null })" 2>&1 || echo "ERR"
}

echo ""
echo "=== liquid ICP (e8s) on known principals ==="
check "dfx mynewdeploy (vm63y)" "$PRIN"
check "master II 4jitt" "4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe"
check "gmtr2 NNS" "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae"
check "ice canister" "6jf55-2qaaa-aaaan-q6mwq-cai"
check "factory" "xfwx3-7yaaa-aaaas-qgxpq-cai"
check "assets" "6hhqv-baaaa-aaaan-q6mxq-cai"

echo ""
echo "=== cycles ==="
echo -n "cycles ledger: "
dfx cycles balance --network ic
echo -n "factory: "
dfx canister --network ic status factory 2>&1 | grep -i "Balance:"
echo -n "ice: "
dfx canister --network ic status ice 2>&1 | grep -i "Balance:"

echo ""
echo "=== account ids (legacy) ==="
echo -n "dfx account-id: "
dfx ledger account-id 2>&1 || true
