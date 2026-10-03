# ICE Network (frostedblocks.com)

On-chain social network and personal sites for **ICE Network**, operated as a trade name of **Walter Wood** (Delaware sole proprietor). This repository is the ICP stack behind [frostedblocks.com](https://frostedblocks.com).

**ICE Lite** ([lite.frostedblocks.com](https://lite.frostedblocks.com), separate repo) is enough on its own: email/Google signup, free social, no wallet, no tokens. **ICE Network** is optional if you want an on-chain username and, later, a personal site on the Internet Computer. Do not treat Lite as a required funnel into Network.

## GitHub is backup — not live

**This GitHub repo is source / backup code only.** Pushing or merging here does **not** change what users see.

| What | Where it actually runs |
|------|-------------------------|
| Live website | [frostedblocks.com](https://frostedblocks.com) → **assets** canister `6hhqv-baaaa-aaaan-q6mxq-cai` |
| Social / profiles / tips | **ice** canister `6jf55-2qaaa-aaaan-q6mwq-cai` |
| Personal site mint / upgrades | **factory** `xfwx3-7yaaa-aaaas-qgxpq-cai` + minted **user_site** canisters |
| Stripe Connect API | [frostedblocks-connect.vercel.app](https://frostedblocks-connect.vercel.app) (secrets stay off-canister) |

To update the live product: **build from this repo, then deploy** to the canisters (and Vercel for Connect). See [docs/GITHUB_VS_LIVE.md](docs/GITHUB_VS_LIVE.md).

## What this product is

- Free **username** on ICE (Internet Identity) to post and browse the feed
- Optional personal site later — one-time **hosting fee of 10 ICP** at mint (2.7 ICP canister cycles / 7.3 ICP network ops); not a token, not equity
- Optional features when enabled in product: ICP tips, referrals, personal-site Store with Stripe Connect Express (seller payouts; Frostblocks does not hold card payments)
- Photos and site content live on personal **user_site** canisters

## What this product is not

- Not a token sale, investment offering, or securities product
- No in-app tokens, soft tokens, or token packs (removed from product)
- Not legal advice; see [Terms](https://frostedblocks.com/terms) and [Privacy](https://frostedblocks.com/privacy)

## Canisters (mainnet)

| Canister name | Mainnet ID | Role |
|---|---|---|
| **ice** | `6jf55-2qaaa-aaaan-q6mwq-cai` | Social backend (posts, profiles, tips, referrals) |
| **messaging** | `6agwb-myaaa-aaaan-q6mxa-cai` | Direct messages (legacy / limited surface) |
| **assets** | `6hhqv-baaaa-aaaan-q6mxq-cai` | Frontend (frostedblocks.com) |
| **factory** | `xfwx3-7yaaa-aaaas-qgxpq-cai` | Personal site mint / cycles / transfers |
| **registry** | `tihtb-myaaa-aaaas-qgxvq-cai` | Domain → site registry |
| **user_site** | `sznn6-uqaaa-aaaas-qgxqa-cai` | User-site WASM template (minted copies) |

## Layout

```
ice/           Motoko source for ice canister
messaging/     Motoko source for messaging canister
assets/        Frontend (Vite/React) → assets canister
factory/       Motoko factory
registry/      Motoko registry
user_site/     Motoko user-site template
connect-backend/  Stripe Connect Express API (separate host; secrets off-canister)
scripts/       Deploy / ops scripts
docs/          Domain, launch, ops, legal-adjacent notes
LICENSE
canister_ids.json
```

## Legal

- [Terms of Service](https://frostedblocks.com/terms)
- [Privacy Policy](https://frostedblocks.com/privacy)
- License: [MIT](./LICENSE) — Copyright Walter Wood / Frosted Blocks (trade name)

## Ops docs (internal)

- [docs/GITHUB_VS_LIVE.md](docs/GITHUB_VS_LIVE.md) — GitHub is backup; canisters/Vercel are live
- [docs/CONNECT_OPS.md](docs/CONNECT_OPS.md) — Connect backend wiring
- [docs/ops-llc-gate.md](docs/ops-llc-gate.md) — when to form a Delaware LLC
- [docs/ops-connect-go-live.md](docs/ops-connect-go-live.md) — gates before relying on Connect / tips / referrals at scale
- [docs/ugc-posting-rules.md](docs/ugc-posting-rules.md) — UGC / likeness rules

## Stripe Connect ops

Factory `adminSetConnectBackend` / seed existing sites + assets `VITE_CONNECT_API_ORIGIN`: see **[docs/CONNECT_OPS.md](docs/CONNECT_OPS.md)**. Enabling Connect payouts for production use is an **ops decision** gated by entity and legal readiness — not implied by this README.
