# I.C.E. — go live on mainnet

This checklist gets the site ready and deployed on the **Internet Computer**.

## Before you deploy

### 1. Cycles / ICP

Mainnet canisters need **cycles** to create and run.

- Your current dfx identity must be able to pay for canister creation.
- Plaintext identities work if you set:
  ```bash
  export DFX_WARNING=-mainnet_plaintext_identity
  ```
- Prefer a secure identity for production:
  ```bash
  dfx identity new ice-prod
  dfx identity use ice-prod
  ```
- Fund with ICP, then convert to cycles (see [dfx ledger docs](https://docs.internetcomputer.org/building-apps/developer-tools/dfx/dfx-ledger)).

Rough order of magnitude (varies by dfx version and subnet):

| Canister   | Suggested first top-up |
|-----------|-------------------------|
| `ice`     | ~1 T cycles             |
| `messaging` | ~0.5 T cycles         |
| `assets`  | ~0.5 T cycles           |

### 2. Code is production-oriented

Already set:

- Mainnet login uses **https://identity.ic0.app** (real Internet Identity).
- Local test login is **disabled** when `DFX_NETWORK=ic`.
- Vite bakes canister IDs into the production build.
- Asset headers via `frontend/.ic-assets.json`.
- Join/username remains **free**. Optional personal site uses the **ICP site / canister purchase fee (10 ICP)** via Factory mint. There are **no** in-app tokens or token packs.

### 3. Claim master on live

After launch, the **first** real II user to open Profile and **Claim Master Profile** becomes Founder. Do this yourself immediately after deploy.

---

## One-command deploy (recommended)

From WSL Ubuntu (Node 20 + dfx available):

```bash
export DFX_WARNING=-mainnet_plaintext_identity
source "$HOME/.local/share/dfx/env"
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 20

cd ~/ScaleSpace   # or your project path
bash scripts/deploy-mainnet.sh
```

The script:

1. Deploys `ice` + `messaging` to `--network ic`
2. Builds the React app with `DFX_NETWORK=ic`
3. Deploys `assets` (the public website)

Then open:

```text
https://<assets-canister-id>.icp0.io/
```

---

## Manual deploy (if you prefer steps)

```bash
export DFX_WARNING=-mainnet_plaintext_identity
cd ~/ScaleSpace

dfx deploy ice --network ic --with-cycles 1000000000000
dfx deploy messaging --network ic --with-cycles 500000000000

ICE=$(dfx canister id ice --network ic)
MSG=$(dfx canister id messaging --network ic)

cd frontend
npm install
DFX_NETWORK=ic CANISTER_ID_ICE=$ICE CANISTER_ID_MESSAGING=$MSG npm run build
cd ..

dfx deploy assets --network ic --with-cycles 500000000000
dfx canister id assets --network ic
```

---

## After go-live

1. Open the assets URL in a browser.
2. **Login with Internet Identity**.
3. **Claim Master Profile** immediately.
4. Smoke-test: post, like, comment; confirm free Join; optionally mint a site with the **ICP site / canister purchase fee (10 ICP)**.
5. Do **not** re-enable removed in-app tokens/packs. Tips / Store Connect are separate optional features — see `docs/ops-connect-go-live.md` before relying on them in production.

### Useful commands

```bash
dfx canister status ice --network ic
dfx canister status messaging --network ic
dfx canister status assets --network ic

# Top up cycles later
dfx canister deposit-cycles 500000000000 ice --network ic
```

### Redeploy after code changes

```bash
# backends only
dfx deploy ice --network ic
dfx deploy messaging --network ic

# frontend only (rebuild first)
cd frontend && DFX_NETWORK=ic npm run build && cd ..
dfx deploy assets --network ic
```

---

## Product fee facts (current)

| Setting | Value |
|--------|--------|
| Username / Join | Free (Internet Identity) |
| Personal site mint | **ICP site / canister purchase fee (10 ICP)** — one-time on-chain fee to deploy a site canister (not a token pack, not equity) |
| In-app tokens / packs | **Removed** — do not re-enable |
| ICP tips / referrals / Stripe Connect Store | Optional product features when wired; no earnings guarantee |

See `docs/ops-llc-gate.md` and `docs/ops-connect-go-live.md` before scaling Connect or paid distribution.
