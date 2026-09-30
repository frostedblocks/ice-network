# I.C.E. Frontend (assets)

React + Vite UI for the I.C.E. Internet Computer app (`assets` canister → frostedblocks.com).

```bash
cd assets
cp -n .env.example .env.local   # set VITE_CONNECT_API_ORIGIN
npm install
npm run dev
```

## Required env

| Variable | Purpose |
| --- | --- |
| **`VITE_CONNECT_API_ORIGIN`** | Public HTTPS origin of **connect-backend** (no trailing slash). Required for Stripe Connect (owner) and public Buy. Without it, Store shows a setup message and Connect/Buy stay disabled. |

Also see `.env.example`. Canister IDs are injected via `vite.config.js` from `../canister_ids.json`, `../.dfx/.../canister_ids.json`, or `CANISTER_ID_*` / `.env.local`.

### Mainnet build

```bash
export DFX_NETWORK=ic
export VITE_CONNECT_API_ORIGIN=https://your-connect-backend.vercel.app
npm run build
```

Vite prints a **warning** when `DFX_NETWORK=ic` and `VITE_CONNECT_API_ORIGIN` is missing — do not ship that build if Connect/Buy should work.

Factory wiring (`adminSetConnectBackend` + seed existing sites): **`docs/CONNECT_OPS.md`**.
