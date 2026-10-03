# ICE Network docs

Internal and ops notes for **ICE Network** ([frostedblocks.com](https://frostedblocks.com)).

> **GitHub is backup / source only.** Live product runs on ICP canisters (and Connect on Vercel when used). See [GITHUB_VS_LIVE.md](./GITHUB_VS_LIVE.md).

## Current product (short)

- Free username via Internet Identity; public feed is free
- Join fee permanently off
- Optional personal site later: one-time **hosting fee of 10 ICP** at mint (2.7 ICP canister cycles / 7.3 ICP network ops) — hosting, not a token sale
- No in-app tokens or token packs
- **ICE Lite** is a separate product and is enough on its own; Network is the optional on-chain upgrade

## Index

| Doc | Purpose |
|-----|---------|
| [GITHUB_VS_LIVE.md](./GITHUB_VS_LIVE.md) | GitHub ≠ live |
| [LAUNCH.md](./LAUNCH.md) | Launch / smoke notes (keep aligned with product) |
| [CONNECT_OPS.md](./CONNECT_OPS.md) | Stripe Connect wiring (ops; do not skip gates) |
| [ops-llc-gate.md](./ops-llc-gate.md) | When to form a Delaware LLC |
| [ops-connect-go-live.md](./ops-connect-go-live.md) | Gates before relying on Connect / tips / referrals |
| [ugc-posting-rules.md](./ugc-posting-rules.md) | UGC / likeness rules |
| [DOMAIN.md](./DOMAIN.md) | Custom domains |
| Other `*.md` in this folder | Historical / canister-specific notes — prefer root README + Terms if anything conflicts |

## Local development

Use the root repo layout (`ice/`, `assets/`, `factory/`, …) and `dfx` against a local replica or mainnet as appropriate. Prefer the root [README.md](../README.md) over any older ScaleSpace clone instructions.

Do **not** re-enable removed token packs. Do **not** treat “payments test mode” docs as current product copy.
