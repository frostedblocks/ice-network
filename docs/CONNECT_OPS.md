# Stripe Connect ops runbook (Factory + assets)

**Fix 3 / ops gap:** Factory `connectBackendPrincipal` stays `null` until an owner calls `adminSetConnectBackend`. Existing user sites are **not** re-seeded automatically — call `adminSeedTrustedRecorderOnSite` per site. Assets builds need `VITE_CONNECT_API_ORIGIN` or the UI reports Connect is not configured.

Do **not** run these mainnet calls from the agent box. Use Heavy (or another machine with `dfx` + the Factory owner identity).

Factory canister (mainnet): `xfwx3-7yaaa-aaaas-qgxpq-cai`  
Assets canister (mainnet): `6hhqv-baaaa-aaaan-q6mxq-cai`

## Prerequisites

1. Connect backend deployed on Vercel with `CONNECT_BACKEND_IC_SEED` (or PEM) set.
2. Know the backend IC principal:

```bash
cd connect-backend
# CONNECT_BACKEND_IC_SEED must match Vercel env
npx tsx scripts/print-principal.ts
# → prints e.g. abcd1-...
```

3. `dfx` identity is the **Factory owner** (same principal that owns `factory` on mainnet).

```bash
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use <factory-owner-identity>
```

## 1. Point Factory at the Connect backend

Replace `CONNECT_BACKEND_PRINCIPAL` with the print-principal output:

```bash
dfx canister --network ic call factory adminSetConnectBackend \
  '(principal "CONNECT_BACKEND_PRINCIPAL")'
```

Verify:

```bash
dfx canister --network ic call factory getConnectBackend --query
# → opt principal "CONNECT_BACKEND_PRINCIPAL"
```

Clear (only if rotating / emergency):

```bash
dfx canister --network ic call factory adminClearConnectBackend
```

After this, **new** mints seed `trustedRecorder` automatically at bootstrap.

## 2. Seed existing store sites

Existing sites minted before step 1 still lack the recorder. For each `user_site` canister id (`SITE_ID`):

```bash
dfx canister --network ic call factory adminSeedTrustedRecorderOnSite \
  '(principal "SITE_ID")'
# → "seedTrustedRecorder: Trusted recorder seeded" (or already present)
```

List candidates:

```bash
dfx canister --network ic call factory listRegisteredSites --query
dfx canister --network ic call factory listActiveCanisters --query
```

Optional helper (placeholders via env):

```bash
CONNECT_PRINCIPAL=CONNECT_BACKEND_PRINCIPAL \
  SITE_IDS="SITE_ID_1 SITE_ID_2" \
  bash scripts/ops-seed-connect-backend.sh
```

Confirm on a site (as owner or via factory-authorized query tooling):

```bash
dfx canister --network ic call SITE_ID listTrustedRecorders --query
```

## 3. Rebuild / redeploy assets with Connect origin

Set the **public** Connect backend origin (same as `CONNECT_PUBLIC_ORIGIN` on Vercel), no trailing slash:

```bash
cd assets
cp -n .env.example .env.local   # once
# edit: VITE_CONNECT_API_ORIGIN=https://your-connect-backend.vercel.app

export DFX_NETWORK=ic
export VITE_CONNECT_API_ORIGIN=https://your-connect-backend.vercel.app
npm ci
npm run build
# then deploy assets dist as usual (Heavy deploy script)
```

Without `VITE_CONNECT_API_ORIGIN`, Vite warns on `DFX_NETWORK=ic` builds and the live UI shows a setup message instead of Connect/Buy.

## One-shot Heavy paste

```bash
# --- after Connect backend is live + seed known ---
export DFX_WARNING=-mainnet_plaintext_identity
dfx identity use <factory-owner-identity>

# 0) Principal from connect-backend (same seed as Vercel):
# cd /path/to/ice-network/connect-backend && npx tsx scripts/print-principal.ts
CONNECT_PRINCIPAL="REPLACE_WITH_CONNECT_BACKEND_PRINCIPAL"

dfx canister --network ic call factory adminSetConnectBackend "(principal \"$CONNECT_PRINCIPAL\")"
dfx canister --network ic call factory getConnectBackend --query

# Seed each existing user_site (repeat / expand list):
for SITE_ID in \
  REPLACE_SITE_ID_1 \
  REPLACE_SITE_ID_2
do
  echo "=== seed $SITE_ID ==="
  dfx canister --network ic call factory adminSeedTrustedRecorderOnSite "(principal \"$SITE_ID\")"
done

# Assets rebuild (origin = CONNECT_PUBLIC_ORIGIN, no trailing slash):
cd /path/to/ice-network/assets
export DFX_NETWORK=ic
export VITE_CONNECT_API_ORIGIN="https://REPLACE_CONNECT_PUBLIC_ORIGIN"
npm ci && npm run build
# deploy assets dist via your usual Heavy script — do not skip VITE_CONNECT_API_ORIGIN
```

## Candid signatures (Factory)

| Method | Args | Notes |
| --- | --- | --- |
| `adminSetConnectBackend` | `principal` | Owner-only. Sets `connectBackendPrincipal`. |
| `adminClearConnectBackend` | _(none)_ | Owner-only. Clears to null. |
| `getConnectBackend` | _(query)_ | Returns `opt principal`. |
| `adminSeedTrustedRecorderOnSite` | `principal` (site) | Owner-only. Calls site `seedTrustedRecorder` with configured backend. Fails with a clear message if backend unset. |

See also `connect-backend/README.md` (backend env + owner-proof flow).
