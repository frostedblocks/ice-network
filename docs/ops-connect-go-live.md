# Ops — Stripe Connect / tips / referrals go-live gates

**Audience:** Walter Wood / Frosted Blocks ops only. Not marketing. Not a compliance certification.

## Product reminder

- **ICP site / canister purchase fee (10 ICP)** is a one-time Factory mint fee for a personal site canister. It is **not** Connect and **not** a token sale.
- In-app tokens / packs stay **removed**.
- This checklist does **not** enable Connect or ICP tip rails by itself — it lists readiness gates.

## Before relying on Stripe Connect Store in production

- [ ] Public **Terms** and **Privacy** live on frostedblocks.com (`/terms`, `/privacy`) and linked in UI
- [ ] Entity decision recorded: sole prop OK for early tests; **DE LLC** before Connect payouts at meaningful volume (see `ops-llc-gate.md`)
- [ ] Connect backend Production env complete (see `CONNECT_OPS.md`); secrets server-only
- [ ] Seller OAuth is owner-proofed; no arbitrary account-id paste
- [ ] Disclosure on Store UI: buyer pays seller via Stripe; Frostblocks does not hold the card payment
- [ ] High-level awareness: Stripe may require identity / KYC for connected accounts; tax reporting may apply to sellers — **not** handled by Motoko; do not claim “tax automated” in product copy
- [ ] Support contact monitored (legal / ops email in Terms)

## Before promoting ICP tips or referrals broadly

- [ ] Terms cover optional tips / referrals: no earnings guarantee; not investment advice
- [ ] UI copy avoids “passive income,” “returns,” or securities framing
- [ ] Confirm tip / referral feature flags match what Terms describe

## Explicit non-claims

- Do not claim FDIC insurance, guaranteed earnings, or securities registration
- Do not describe the 10 ICP site fee as an investment or token purchase
