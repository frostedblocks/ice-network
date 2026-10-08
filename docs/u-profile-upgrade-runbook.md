# Ice upgrade runbook — username hold (PR1)

Canister: `6jf55-2qaaa-aaaan-q6mwq-cai`  
Identity: `mynewdeploy` (controller)  
Mode: **upgrade only** — never reinstall  
Rollback: **load pre-upgrade snapshot only** — never reinstall previous WASM over newer state

Keep raw `dfx` output (status dumps, `getPostsByAuthor` bodies) **outside the repo**. In-repo docs record counts and the snapshot id only.

## 0. Checkout merged SHA (before step 1)

```bash
cd /home/walt_wood1/ice-network-deploy
git fetch origin
git checkout <merged-PR1-SHA>
git status   # must be clean (no local edits to ice/ WASM inputs)
dfx identity use mynewdeploy
dfx identity get-principal
# Confirm that principal is listed as a controller:
dfx canister info ice --network ic
# or: dfx canister status ice --network ic  → Controllers: …
```

If the tree is dirty or the identity is not a controller → **STOP**.

## 1. Preflight

```bash
dfx identity use mynewdeploy
dfx canister status ice --network ic   # note cycles; abort if too low
dfx build ice --network ic
```

Record git SHA of the WASM you are about to deploy.

## 2. Before counts (take immediately before `canister stop`)

### This deploy only (first upgrade that introduced `getUpgradeCounts`)

1. Master UI → Profile → Site stats: record `registeredAccounts`, `totalPosts`, `visiblePosts`, `hiddenPosts`, `totalProfiles`, `totalComments`.
2. Controller dfx sanity (ogsk6 has posts; gmtr2 empty is expected):

```bash
dfx canister call ice getPostsByAuthor "(principal \"ogsk6-lwnep-oa422-nqvac-puciz-6fbaw-emuqb-xi6ay-ga75u-3e5rh-jae\", 20)" --network ic
```

Save counts under `docs/upgrade-counts-pre-THIS.md` (counts only — no post bodies).  
**STOP** if `totalPosts` or `totalProfiles` are zero.

### Next upgrades

```bash
dfx canister call ice getUpgradeCounts --network ic > /tmp/upgrade-counts-pre.txt
# Copy the numeric fields into docs/upgrade-counts-pre.json (counts only)
```

Must be non-zero for `posts` and `profiles`. Trap or zeros → **STOP** (wrong identity or canister).

## 3. Snapshot (mandatory)

```bash
dfx canister stop ice --network ic
dfx canister snapshot create ice --network ic   # record snapshot id in docs
```

If snapshot create fails because a snapshot **already exists** → `dfx canister start ice --network ic`, then **STOP and ask**. Do **not** replace/delete the existing snapshot.

On any other snapshot failure:

```bash
dfx canister start ice --network ic
# STOP the run — no module-hash fallback
```

## 4. Upgrade (no auto-confirm)

```bash
dfx deploy ice --network ic --mode upgrade
# Do NOT pass --yes
```

If dfx shows any **stable-compatibility**, **data-loss**, or **Candid-incompatibility** prompt → answer **no**, then:

```bash
dfx canister start ice --network ic
```

and **STOP**.

On a clean upgrade:

```bash
# If wasm_memory_persistence is required by dfx, use: --wasm-memory-persistence keep
dfx canister start ice --network ic
```

## 5. After counts

1. Master UI Site stats again: every field must be **≥** the pre screenshot (`totalPosts`, `profiles`, `registered`, `comments`, etc.).
2. Controller:

```bash
dfx canister call ice getUpgradeCounts --network ic
```

Like-for-like gate:

- `getUpgradeCounts.posts` **==** pre `visiblePosts + hiddenPosts`
- `getUpgradeCounts.profiles` **≥** pre `totalProfiles`
- Save the full `getUpgradeCounts` record as the **baseline for the next upgrade** (counts only in-repo).

## 6. Hold smoke (test identities only)

Use **test** Internet Identities only — do not rename or hold-smoke real member accounts.

1. Rename a test account once → `getPrincipalByUsername(old)` still returns same principal.
2. Second test principal claiming old name → `"Username already taken"`.
3. Fourth new key while 3 held → hold-limit error.

## 7. Rollback

```bash
dfx canister stop ice --network ic
dfx canister snapshot load ice <SNAPSHOT_ID> --network ic
dfx canister start ice --network ic
```

Do **not** reinstall an old WASM over newer state.
