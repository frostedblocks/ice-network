#!/bin/bash
set -euo pipefail
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use mynewdeploy

TPK="tpk5h-7ir2j-nenrh-qmzcy-rqlxp-3fitp-bbtgd-bwggx-352ke-6d5pt-pqe"
FUG="fug2a-haaaa-aaaas-qgyaa-cai"

echo "=== ICE isRegistered / profile ==="
dfx canister call 6jf55-2qaaa-aaaan-q6mwq-cai adminLookupUser "(\"$TPK\")" --network ic --query 2>&1 || true
dfx canister call 6jf55-2qaaa-aaaan-q6mwq-cai isUserRegistered "(principal \"$TPK\")" --network ic --query 2>&1 || true
dfx canister call 6jf55-2qaaa-aaaan-q6mwq-cai getUserInfo "(principal \"$TPK\")" --network ic --query 2>&1 || true

echo "=== Factory pending + site status ==="
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai listPendingMints --network ic --query
dfx canister --network ic status "$FUG" 2>&1 | head -25 || true
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai getSiteOwner "(principal \"$FUG\")" --network ic --query 2>&1 || true
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai getUserCanister "(principal \"$TPK\")" --network ic --query 2>&1 || true

echo "=== Factory fees (mint has no ICP fee) ==="
dfx canister call xfwx3-7yaaa-aaaas-qgxpq-cai getFees --network ic --query

echo DONE
