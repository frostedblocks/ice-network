#!/bin/bash
export PATH="/usr/bin:/bin:$HOME/.local/share/dfx/bin:$PATH"
export DFX_WARNING=-mainnet_plaintext_identity
cd /home/walt_wood1/ice-network
dfx identity use mynewdeploy

echo "=== health ==="
dfx canister call factory health --network ic --query

echo "=== getNetworkCyclesHealth ==="
dfx canister call factory getNetworkCyclesHealth --network ic 2>&1 || true

echo "=== listRegisteredSites ==="
dfx canister call factory listRegisteredSites --network ic --query 2>&1 || true

echo "=== factory canister status ==="
dfx canister status xfwx3-7yaaa-aaaas-qgxpq-cai --network ic 2>&1

echo "=== try common pending/mint queries ==="
for m in listPendingMints getPendingMints adminListPendingMints listPending listFailedMints getWasmSize; do
  echo "-- $m --"
  dfx canister call factory "$m" --network ic --query 2>&1 | head -5 || true
done
