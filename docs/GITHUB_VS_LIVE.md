# GitHub vs live (ICE Network)

## Rule

**GitHub (`frostedblocks/ice-network`) = backup / source code.**  
**Live product = Internet Computer canisters + Connect host.**

Merging a PR does nothing for end users until someone deploys.

## Live surfaces

1. **frostedblocks.com** — frontend from the **assets** canister (`6hhqv-baaaa-aaaan-q6mxq-cai`)
2. **ice** — posts, profiles, tips, referrals (`6jf55-2qaaa-aaaan-q6mwq-cai`)
3. **factory** — mint / upgrade personal sites (`xfwx3-7yaaa-aaaas-qgxpq-cai`)
4. **user_site** copies — each personal site (photos, Store products, etc.)
5. **registry** — custom domains (`tihtb-myaaa-aaaas-qgxvq-cai`)
6. **frostedblocks-connect.vercel.app** — Stripe Connect Express API (not an ICP canister)

## Deploy reminder

- Motoko changes → `dfx build` + `dfx deploy <canister> --network ic` (or factory WASM upload + site upgrades for `user_site`)
- Frontend changes → build `assets/` with the right `VITE_*` env, then upgrade the **assets** canister
- Connect API changes → deploy the `connect-backend` project on Vercel; Production env + Redeploy

## Matching repo to canisters

After a deploy, the live **module hash** on a Motoko canister should match a WASM built from the commit you intended. Asset canisters also serve static files from the last assets install — check live URLs (e.g. `/terms`), not only GitHub.
