# ICE Connect Backend

Security-first **Stripe Connect Express** backend for ICE Network personal stores.

Deploy on Vercel. Owners connect payouts via Express OAuth; buyers pay via Checkout; the backend records on-chain receipts with a dedicated IC identity (no buyer email/name).

## What this does

| Route | Purpose |
| --- | --- |
| `POST /api/connect/challenge` | Body `{ siteId }`. Returns HMAC-signed `{ challenge }` bound to siteId (≈5 min TTL, one-time at start). |
| `POST /api/connect/start` | Body `{ siteId, challenge, sessionIdentity, delegation? }`. **Requires cryptographic owner proof** (II/session). Reconstructs identity, authenticated IC query, `principal === getOwner`. Returns Stripe Express OAuth `{ url }` with HMAC-signed state locking `siteId` + verified `ownerPrincipal`. Bare `ownerPrincipal` strings are **rejected**. |
| `GET /api/connect/callback` | Stripe OAuth return. Verifies state, exchanges `code` → connected account id, sets httpOnly completion cookie (siteId + ownerPrincipal + accountId), redirects to `NEXT_PUBLIC_APP_ORIGIN?connect=success&site=…`. |
| `GET /api/connect/result?siteId=` | Requires completion cookie. Re-checks canister `getOwner` matches cookie owner; then **trusted recorder** calls `bindStripePublic`. Returns `{ accountId, publishableKey }` once. **Does not** use FE `setStripePublic`. |
| `POST /api/checkout/session` | Body `{ siteId, productId, successPath?, cancelPath? }` **only**. Reads `getProduct` + `getStripePublic` from canister. Creates Checkout with `stripeAccount`. **Does not trust client amounts.** |
| `POST /api/webhooks/stripe` | Verifies signature. On `checkout.session.completed`, calls `recordReceipt` with backend IC identity. |

MVP **platform fee = 0%** (`application_fee_amount` omitted unless `CONNECT_PLATFORM_FEE_BPS` &gt; 0).

## Owner proof (Stripe Connect)

Payout hijack class of bug: comparing a **client-supplied** `ownerPrincipal` string to public `getOwner` is not authentication — anyone who knows the owner text could start OAuth with their own Stripe account.

**Required flow:**

1. Authenticated owner (Internet Identity or local Ed25519) on frostedblocks.com opens Store → Connect.
2. FE `POST /api/connect/challenge` with `{ siteId }` → `{ challenge }`.
3. FE builds proof from the AuthClient identity:
   - **II (`DelegationIdentity`)**: export inner **Ed25519** session via `identity._inner.toJSON()` plus `identity.getDelegation().toJSON()`.
   - **Local Ed25519**: `identity.toJSON()`.
4. FE `POST /api/connect/start` with `{ siteId, challenge, sessionIdentity, delegation? }` (credentials included for CORS).
5. Backend:
   - Verifies challenge HMAC + siteId + one-time consume
   - Reconstructs `Ed25519KeyIdentity` / `DelegationIdentity`
   - Checks delegation leaf pubkey matches session + `isDelegationValid`
   - Performs an **authenticated** IC `getOwner` query as that identity (replica verifies II canister signatures on the chain)
   - Requires `identity.getPrincipal() === getOwner(siteId)`
6. Only then mints OAuth `state` and returns Stripe URL.
7. After OAuth, callback mints httpOnly completion cookie from verified state (not client input).
8. `GET /api/connect/result` re-loads `getOwner`, requires match to cookie owner, then `bindStripePublic` as **trustedRecorder** only.

`user_site.setStripePublic` stays disabled for owners (“Use Connect with Stripe”). Binding is recorder-only.

### Frontend / AuthClient note

Connect proof needs a **JSON-serializable Ed25519 session key**. Assets `AuthClient.create` must use `keyType: "Ed25519"`. Users on an older ECDSA II session should **sign out and sign in once** before Connect.

Session key material is sent only to this trusted backend over HTTPS (already holds Stripe secrets + recorder seed). Treat it like a short-lived bearer secret; II delegations expire.

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

After deploy, call Factory **`adminSetConnectBackend(principal)`** with this backend’s principal so new mints `seedTrustedRecorder`. For existing store sites, owner/factory must `addTrustedRecorder` / `seedTrustedRecorder` the same principal or `recordReceipt` / `bindStripePublic` will fail.

> If `adminSetConnectBackend` is not yet live on your Factory build, seed recorders manually until the admin API is deployed.

### 4. Vercel env

Copy `.env.example` → project env vars. Never put `STRIPE_SECRET_KEY`, webhook secret, OAuth state secret, or IC seed/PEM in client bundles or canister storage.

| Var | Notes |
| --- | --- |
| `STRIPE_SECRET_KEY` | Platform secret |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` |
| `STRIPE_PUBLISHABLE_KEY` | Platform `pk_` returned after OAuth / used in `bindStripePublic` |
| `STRIPE_CONNECT_CLIENT_ID` | `ca_…` (required for Express OAuth) |
| `CONNECT_OAUTH_STATE_SECRET` | HMAC for challenge + OAuth state + completion cookie |
| `CONNECT_BACKEND_IC_SEED` or `CONNECT_BACKEND_IC_IDENTITY_PEM` | Ed25519 for `recordReceipt` / `bindStripePublic` |
| `NEXT_PUBLIC_APP_ORIGIN` | `https://frostedblocks.com` |
| `CONNECT_PUBLIC_ORIGIN` | This deployment URL |

### 5. Deploy

```bash
cd connect-backend
npm install
npm run build
# vercel --prod  (or Git integration with Root Directory = connect-backend)
```

Also deploy **assets** so SiteStore sends owner proof and AuthClient uses Ed25519.

## Frontend flow (owner)

1. Signed-in owner clicks Connect → `POST /api/connect/challenge` then `POST /api/connect/start` with session proof (`credentials: 'include'`).
2. Redirect browser to returned `url` (Stripe Express OAuth).
3. Stripe returns to callback → redirect to `frostedblocks.com?connect=success&site={siteId}` with httpOnly cookie on **connect backend** origin.
4. FE detects `connect=success` and `fetch(CONNECT_PUBLIC_ORIGIN + '/api/connect/result?siteId=' + siteId, { credentials: 'include' })`.
5. Backend trusted recorder binds via `bindStripePublic` — **never** FE `setStripePublic`, never paste arbitrary account ids.

## Checkout allowlist + CORS (custom-domain Buy)

PublicSite sends **relative** `successPath` / `cancelPath` only (not absolute `successUrl` / `cancelUrl`).
The backend builds absolute Stripe return URLs from the **allowlisted request `Origin`**.

Allowed bases only:

- Request `Origin` when it matches one of:
  - `NEXT_PUBLIC_APP_ORIGIN` (frostedblocks.com)
  - `https://{siteId}.icp0.io` / `https://{siteId}.raw.icp0.io` (and other `*.icp0.io` / `*.ic0.app` for CORS)
  - Custom domain / `publicUrl` from canister `getDomainStatus` (https)
  - Extra origins in env `ALLOWED_ORIGINS` (comma-separated)
- Absolute `https` values in `successPath`/`cancelPath` are still accepted only if their origin is in that allowlist (legacy); FE must not send `successUrl`/`cancelUrl`.
- On frostedblocks.com, return URLs must include this site (`#/site/{siteId}` or `?site={siteId}`).

**CORS:** Checkout OPTIONS/POST allow brand + ICP asset origins + `ALLOWED_ORIGINS`. For a site custom domain, pass `?siteId=` on the checkout URL so preflight can load `getDomainStatus` and reflect that Origin. Connect owner routes remain usable from brand / ICP / `ALLOWED_ORIGINS`.

Open redirects to arbitrary hosts are rejected.

## Security notes

- **Owner proof required** for Connect start — public `getOwner` text alone cannot start OAuth or bind payouts.
- **No secrets in assets / client bundles / canisters.** Only Stripe **public** account id + platform `pk_` land on-chain via recorder `bindStripePublic`.
- **Do not trust client amounts.** Checkout line items come from canister `priceCents` / `currency`.
- **Express OAuth only** — not Standard Connect; no “paste any account id” path in this backend.
- OAuth `state` is HMAC-signed with expiry; completion cookie is httpOnly, `SameSite=None; Secure`, short-lived, cleared after one successful `result` read; result re-checks `getOwner`.
- Webhook signature verified before any IC call; receipts store `buyerRef = session.id` only (no email/name).
- CORS: brand (`NEXT_PUBLIC_APP_ORIGIN`) + `*.icp0.io` / `*.ic0.app` + `ALLOWED_ORIGINS`; checkout also allows the site custom domain from `getDomainStatus` when `?siteId=` is present. Never reflects arbitrary Origins.

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
