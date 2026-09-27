# ICE Connect Backend

Security-first **Stripe Connect Express** backend for ICE Network personal stores.

Deploy on Vercel. Owners connect payouts via Express OAuth; buyers pay via Checkout; the backend records on-chain receipts with a dedicated IC identity (no buyer email/name).

## What this does

| Route | Purpose |
| --- | --- |
| `POST /api/connect/start` | Body `{ siteId, ownerPrincipal }`. Anonymous IC `getOwner` must match. Returns Stripe Express OAuth `{ url }` with HMAC-signed state. |
| `GET /api/connect/callback` | Stripe OAuth return. Verifies state, exchanges `code` → connected account id, sets httpOnly completion cookie, redirects to `NEXT_PUBLIC_APP_ORIGIN?connect=success&site=…`. |
| `GET /api/connect/result?siteId=` | Requires completion cookie (CORS + credentials from frostedblocks.com). Returns `{ accountId, publishableKey }` **once** for owner FE → `setStripePublic`. |
| `POST /api/checkout/session` | Body `{ siteId, productId, successPath?, cancelPath? }` **only**. Reads `getProduct` + `getStripePublic` from canister. Creates Checkout with `stripeAccount`. **Does not trust client amounts.** |
| `POST /api/webhooks/stripe` | Verifies signature. On `checkout.session.completed`, calls `recordReceipt` with backend IC identity. |

MVP **platform fee = 0%** (`application_fee_amount` omitted unless `CONNECT_PLATFORM_FEE_BPS` &gt; 0).

## Setup

### 1. Stripe

1. Enable **Connect** with **Express** accounts.
2. Copy platform `sk_`, `pk_`, and Connect **OAuth client id** (`ca_…`).
3. Add OAuth redirect URI: `{CONNECT_PUBLIC_ORIGIN}/api/connect/callback`.
4. Create a webhook endpoint → `{CONNECT_PUBLIC_ORIGIN}/api/webhooks/stripe`.
   - Subscribe to `checkout.session.completed`.
   - For **direct charges** (`stripeAccount` on Session), enable listening on **Connected accounts** (Connect webhook) so platform receives those events.

### 2. IC identity (trusted recorder)

Generate a dedicated Ed25519 seed (do **not** reuse personal II):

```bash
openssl rand -hex 32
```

Set `CONNECT_BACKEND_IC_SEED` to that hex. Print the principal:

```bash
npm install
# export CONNECT_BACKEND_IC_SEED=...
npx tsx scripts/print-principal.ts
```

### 3. Factory: `adminSetConnectBackend`

After deploy, call Factory **`adminSetConnectBackend(principal)`** with this backend’s principal so new mints `seedTrustedRecorder`. For existing store sites, owner/factory must `addTrustedRecorder` / `seedTrustedRecorder` the same principal or `recordReceipt` will fail.

> If `adminSetConnectBackend` is not yet live on your Factory build, seed recorders manually until the admin API is deployed.

### 4. Vercel env

Copy `.env.example` → project env vars. Never put `STRIPE_SECRET_KEY`, webhook secret, OAuth state secret, or IC seed/PEM in client bundles or canister storage.

| Var | Notes |
| --- | --- |
| `STRIPE_SECRET_KEY` | Platform secret |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `STRIPE_PUBLISHABLE_KEY` | Platform `pk_` returned after OAuth for `setStripePublic` |
| `STRIPE_CONNECT_CLIENT_ID` | `ca_…` (required for Express OAuth) |
| `CONNECT_OAUTH_STATE_SECRET` | HMAC for state + completion cookie |
| `CONNECT_BACKEND_IC_SEED` or `CONNECT_BACKEND_IC_IDENTITY_PEM` | Ed25519 for `recordReceipt` |
| `NEXT_PUBLIC_APP_ORIGIN` | `https://frostedblocks.com` |
| `CONNECT_PUBLIC_ORIGIN` | This deployment URL |

### 5. Deploy

```bash
cd connect-backend
npm install
npm run build
# vercel --prod  (or Git integration with Root Directory = connect-backend)
```

## Frontend flow (owner)

1. Authenticated owner calls `POST /api/connect/start` with `{ siteId, ownerPrincipal }` (`credentials` not required).
2. Redirect browser to returned `url` (Stripe Express OAuth).
3. Stripe returns to callback → redirect to `frostedblocks.com?connect=success&site={siteId}` with httpOnly cookie on **connect backend** origin.
4. FE detects `connect=success` and `fetch(CONNECT_PUBLIC_ORIGIN + '/api/connect/result?siteId=' + siteId, { credentials: 'include' })`.
5. Owner II calls canister `setStripePublic(accountId, publishableKey)` — **never** paste arbitrary account ids without this OAuth path.

## Checkout allowlist

`successPath` / `cancelPath` may be absolute `https` URLs or paths. Allowed bases only:

- Custom domain / `publicUrl` from `getDomainStatus` (https)
- `https://{siteId}.icp0.io/`
- `https://{siteId}.raw.icp0.io/`
- `NEXT_PUBLIC_APP_ORIGIN` with `#/site/{siteId}` hash **or** `?site={siteId}`

Open redirects are rejected.

## Security notes

- **No secrets in assets / client bundles / canisters.** Only Stripe **public** account id + platform `pk_` land on-chain via owner `setStripePublic`.
- **Do not trust client amounts.** Checkout line items come from canister `priceCents` / `currency`.
- **Express OAuth only** — not Standard Connect; no “paste any account id” path in this backend.
- OAuth `state` is HMAC-signed with expiry; completion cookie is httpOnly, `SameSite=None; Secure`, short-lived, cleared after one successful `result` read.
- Webhook signature verified before any IC call; receipts store `buyerRef = session.id` only (no email/name).
- CORS for credentialed `result` / start / checkout is restricted to `NEXT_PUBLIC_APP_ORIGIN`.

## Local dev

```bash
cp .env.example .env.local
# fill values; use Stripe test keys + Connect test client id
npm run dev
```

Stripe CLI for webhooks:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

## License

Private — ICE Network / Frosted Blocks.
