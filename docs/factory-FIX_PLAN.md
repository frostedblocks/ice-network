# ICE / FrostedBlocks — Critical Hardening Plan

Prioritized tickets from the 10-risk review. **P0/P1 = ship first.**

---

## P0 / P1 — In progress / next deploys

### T1 — Payment atomicity & ICP refunds *(P1)*
**Risk:** #1 ICP charged, action fails  
**Scope:** Factory `detach` / `relink` / `topUpCycles`; pattern for ICE packs  
**Work:**
- [x] `refundIcp(to, amountE8s)` on Factory (icrc1_transfer back to user)
- [x] Validate fully **before** charge (already true for detach/relink gates)
- [x] On post-pay failure (`onRelink`, `deposit_cycles`): **refund** then return clear error
- [x] Track `totalIcpReceivedE8s` down on successful refund
- [x] ICE: `refundIcp` helper live (ready for post-pay paths)
- [ ] Optional: pending “failed action” queue for master if refund itself fails

**Acceptance:** Relink fail after pay → user ICP returned (minus ledger fee side-effects); error text mentions refund status.

---

### T2 — Factory controller invariant *(P1)*
**Risk:** #2 Factory loses controller → reset/upgrade dead  
**Scope:** Factory  
**Work:**
- [x] `factoryIsController(cid)` via `canister_status`
- [x] `requireFactoryController` before reset / upgrade
- [x] `adminSetControllers` always **re-includes Factory** principal
- [x] `applyStandardControllers` already includes factory (keep)
- [ ] Frontend: SiteControllers warn if factory missing + “Restore factory controller” button
- [ ] Ops: periodic script listing sites missing factory controller

**Acceptance:** Reset/upgrade fail fast with actionable message if factory not controller; cannot save controller list without factory.

---

## P2 — Next sprint

### T3 — Factory cycles + join → site guarantee *(P2)* ✅
**Risk:** #3, #8  
- [x] `getProvisionCapacity` / block paid Join when factory cannot mint  
- [x] Join: retry `ensureUserSite` 3×; “Retry website only” (no second fee)  
- [x] My Site: auto-provision with retries if registered but no site  
- [x] Master: “Provision site (no fee)” + factory cycles on CycleBalance  
- [x] `adminProvisionSite` / `ensureUserSite`

### T4 — II principal mismatch recovery ✅
**Risk:** #4  
- [x] Login origin note on Join  
- [x] `adminMigrateMembership(from, to)` on ICE  
- [x] `adminReassignSite(site, newOwner)` on Factory  
- [x] Master UI: migrate + reassign + “Use for migrate”

### T5 — Registry mint hard-fail / reconcile ✅
**Risk:** #6, #7  
- [x] Registry write errors returned (not silent) on mint  
- [x] `adminReconcileRegistry`  
- [x] Reattach: Registry required when configured; unreachable → clear error  
- [x] Master: Reconcile Registry button

### T6 — Partial mint recovery ✅
**Risk:** #7  
- [x] `pendingMints` stable map (stage + lastError)  
- [x] Auto-resume on next `createUserSite` / `ensureUserSite`  
- [x] `listPendingMints`, `adminResumePendingMint`, `adminAbandonPendingMint`  
- [x] Master Resets tab: Partial mints panel

---

## P3 — Safety & ops

### T7 — Factory reset safety ✅
**Risk:** #5, #9  
- [x] User reset: once / 24h per site  
- [x] User reset: linked owner II only (not NNS/dfx controller path)  
- [x] `getUserResetStatus` for UI  
- [x] UI: type RESET + double confirm  
- [x] Emergency: factory owner only + log (already)

### T8 — Controller blast radius ✅
**Risk:** #9  
- [x] Document controller roles + factory always kept  
- [x] Default includes **dfx** (owner + NNS + dfx + factory) — user preference  
- [x] `getControllerPolicy` docs

### T9 — Cycles freeze on sites / Registry ✅
**Risk:** #10  
- [x] Factory `detach` blocks when site `lowCycles` / under 2 T  
- [x] My Site Network: detach locked + link to Infrastructure top-up  
- [x] `getNetworkCyclesHealth` (factory + registry)  
- [x] Registry `getCyclesBalance` / `isLowCycles`  
- [x] Master CycleBalance shows factory + registry

### T10 — Detach DNS integrity
**Honorable**  
- [x] Soft-check ICP validate API before `confirmSiteDns`  
- [x] Don’t set ready without live validate success in production mode (`SiteDomainDns`)  
- [x] Factory: public URL host must match domain; confirm + detach require domain index integrity  
- [x] Detach UI re-validates domain with icp0.io before charging fee  
- [x] Shared helper `icpDomainValidate.js`

---

## PR / deploy units

| PR | Tickets | Canisters |
|----|---------|-----------|
| **PR-A** (this) | T1 + T2 core | factory (+ ice refund helper if needed) |
| **PR-B** | T3 join→site | factory + frontend Register/MySite |
| **PR-C** | T5 Registry hard-fail | factory + registry |
| **PR-D** | T7–T9 safety UX | factory + frontend |

---

## Deploy commands (PR-A)

```bash
# Factory
bash /mnt/c/Users/walt_/ice-network/scripts/deploy-factory-reset.sh
# or:
dfx deploy factory --network ic --yes

# ICE main (if refund helper added)
dfx deploy ice --network ic --yes   # from ScaleSpace

# Frontend only if UI messages change
bash /mnt/c/Users/walt_/ScaleSpace/scripts/deploy-assets-only.sh
```
