# Connect a custom domain to I.C.E.

Your live site today:

```text
https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/
```

Assets canister ID (use this for DNS):

```text
6hhqv-baaaa-aaaan-q6mxq-cai
```

## Important: Internet Identity principals

II creates a **different user principal per website origin**.

- Users who signed in on `*.icp0.io` get principal A  
- Users who sign in on `yourdomain.com` get principal B  

So:

- If you already **Claimed Master** on the icp0.io URL, that master is tied to that origin’s principal.
- On the custom domain you may need to **claim master again** (or set up [II alternative origins](https://docs.internetcomputer.org/building-apps/authentication/internet-identity/alternative-origins) later so both origins share identities).

Prefer: finish domain setup **before** inviting real users, and claim master on the **final domain**.

---

## Step 1 — DNS records (at your registrar)

Replace `YOUR_DOMAIN` with your real domain (examples below).

### Subdomain example: `app.example.com`

| Type | Host / Name | Value |
|------|-------------|--------|
| **CNAME** | `app` (or `app.example.com`) | `app.example.com.icp1.io` |
| **TXT** | `_canister-id.app` | `6hhqv-baaaa-aaaan-q6mxq-cai` |
| **CNAME** | `_acme-challenge.app` | `_acme-challenge.app.example.com.icp2.io` |

### Apex example: `example.com` (root domain)

Many registrars block CNAME on `@`. Prefer **ALIAS/ANAME**, or move DNS to **Cloudflare** (DNS only, not proxied).

| Type | Host | Value |
|------|------|--------|
| **ALIAS/ANAME** (or CNAME if allowed) | `@` | `example.com.icp1.io` |
| **TXT** | `_canister-id` | `6hhqv-baaaa-aaaan-q6mxq-cai` |
| **CNAME** | `_acme-challenge` | `_acme-challenge.example.com.icp2.io` |

### Cloudflare extras

- Proxy status: **DNS only** (grey cloud, not orange)
- Disable **Universal SSL** (SSL/TLS → Edge Certificates) before registration  
  (it interferes with ICP’s certificate challenge)

DNS can take a few minutes to several hours to propagate.

---

## Step 2 — Put the domain in the canister

1. Edit `frontend/public/.well-known/ic-domains` so it contains **only** your domain(s), one per line, no `https://`:

   ```text
   app.example.com
   ```

2. Rebuild and redeploy assets:

   ```bash
   export DFX_WARNING=-mainnet_plaintext_identity
   dfx identity use mynewdeploy
   cd ~/ScaleSpace

   ICE=$(dfx canister id ice --network ic)
   MSG=$(dfx canister id messaging --network ic)

   cd frontend
   DFX_NETWORK=ic CANISTER_ID_ICE=$ICE CANISTER_ID_MESSAGING=$MSG npm run build
   cp -f .ic-assets.json dist/.ic-assets.json
   # Vite copies public/ into dist — confirm:
   cat dist/.well-known/ic-domains
   cd ..

   dfx deploy assets --network ic
   ```

3. Check the file is public:

   ```bash
   curl -sL https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/.well-known/ic-domains
   ```

   You should see your domain listed.

---

## Step 3 — Validate DNS + ownership

```bash
curl -sL "https://icp.net/custom-domains/v1/YOUR_DOMAIN/validate"
```

Fix any errors it reports (DNS missing, wrong TXT, ic-domains file missing).

---

## Step 4 — Register the domain

```bash
curl -sL -X POST "https://icp.net/custom-domains/v1/YOUR_DOMAIN"
```

Or:

```bash
bash scripts/register-custom-domain.sh YOUR_DOMAIN
```

---

## Step 5 — Wait for certificate

```bash
curl -sL "https://icp.net/custom-domains/v1/YOUR_DOMAIN"
```

When status is **`registered`**, open `https://YOUR_DOMAIN` (give it a few minutes).

---

## After it works

1. Open the custom domain.
2. Login with Internet Identity.
3. Claim Master Profile if you haven’t on this origin yet.
4. Optional: set up II **alternative origins** so `icp0.io` and your domain share the same principals.

---

## Quick checklist

- [ ] Domain purchased  
- [ ] 3 DNS records set (CNAME + TXT + ACME CNAME)  
- [ ] `ic-domains` file deployed on assets canister  
- [ ] `curl .../validate` succeeds  
- [ ] `POST` registration succeeds  
- [ ] Status `registered`  
- [ ] Site loads on `https://your-domain`  
- [ ] Login + claim master on that domain  

Tell the assistant your exact domain name to fill DNS values precisely.

---

## Frosted Blocks — apex vs www (current)

| Host | Status | Notes |
|------|--------|--------|
| `www.frostedblocks.com` | **Registered** on ICP → assets `6hhqv-…` | Clean paths + `.html` work (`/about`, `/how-to-join`, `/partners`) |
| `frostedblocks.com` (apex) | **Not registered** on ICP | GoDaddy **domain forwarding** (A → `3.33.251.168` / `15.197.225.128`). `/` 301s to www **without path**; `/about` etc. return **404** from `awselb` |

Canister assets and `enable_aliasing` are fine (raw `*.icp0.io` and **www** already serve the same paths). Apex fails at **DNS / custom-domain registration**, not in the frontend build.

### Fix apex (recommended): Cloudflare DNS → ICP custom domain

GoDaddy nameservers (`ns29/ns30.domaincontrol.com`) do not support a proper apex CNAME/ALIAS to ICP. Move DNS to Cloudflare (free), keep the domain at GoDaddy, then:

1. In GoDaddy: turn **off** Domain Forwarding for `frostedblocks.com`.
2. In Cloudflare (DNS only / grey cloud — **not** proxied orange):

| Type | Name | Content |
|------|------|---------|
| CNAME | `@` | `frostedblocks.com.icp1.io` |
| TXT | `_canister-id` | `6hhqv-baaaa-aaaan-q6mxq-cai` |
| CNAME | `_acme-challenge` | `_acme-challenge.frostedblocks.com.icp2.io` |

Keep the existing **www** records:

| Type | Name | Content |
|------|------|---------|
| CNAME | `www` | `www.frostedblocks.com.icp1.io` (or `icp1.io` if that is what you already use) |
| TXT | `_canister-id.www` | `6hhqv-baaaa-aaaan-q6mxq-cai` |
| CNAME | `_acme-challenge.www` | `_acme-challenge.www.frostedblocks.com.icp2.io` |

3. Confirm `frontend/public/.well-known/ic-domains` still lists both:

```text
frostedblocks.com
www.frostedblocks.com
```

4. Validate + register apex:

```bash
bash scripts/register-custom-domain.sh frostedblocks.com
# or:
bash scripts/sync-hosting-domains.sh --register frostedblocks.com
```

5. When status is `registered`, verify:

```bash
bash scripts/verify-apex-get.sh
bash scripts/verify-landing-acceptance.sh
```

### Interim-only (not preferred)

Path-preserving redirects at the registrar (apex → `https://www.frostedblocks.com$request_uri`) can paper over deep links, but GoDaddy’s HTTPS forwarder currently **404s** non-root paths. Prefer ICP registration above so apex **serves** the same canister paths as www.

---

## Prevent duplicate personal canisters (II principals)

Internet Identity issues a **different principal per frontend origin** unless shared login works.

**Canonical identity origin (derivation):**  
`https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io`

### Before cutting over any new hostname

1. Add `https://new-host` to `frontend/public/.well-known/ii-alternative-origins` (no trailing slash).  
2. Redeploy assets.  
3. Confirm login code passes `derivationOrigin` = the canonical assets URL.  
4. **Smoke test:** sign in on the new host → principal must equal the principal from the canonical URL (same II).  
5. Only then share the new host for Join / master use.

### If a customer already Joined and sees a “new” principal

- Do **not** Create account again (second Join fee + second site mint).  
- Use Join → **I already have an account** (lookup original principal) → open the canonical app with the **same** II.  
- Ops recovery: `adminMigrateMembership` + factory `adminReassignSite` if they must keep using a split principal.

### Same-principal safety (already in factory)

`ensureUserSite` / `createUserSite` return the **existing** linked canister for that principal — they do not mint a second one for the same II principal.
