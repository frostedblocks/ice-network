# Ice upgrade runbook

Canister: `6jf55-2qaaa-aaaan-q6mwq-cai`  
Identity: `mynewdeploy` (controller)  
Mode: **upgrade only** — never reinstall  
Rollback: **load the snapshot created in step 3 of THIS run only** — never reinstall previous WASM over newer state, and never load an older run’s snapshot

Keep raw `dfx` output (status dumps, `getPostsByAuthor` bodies) **outside the repo**. In-repo docs record counts and the snapshot id only.

## 0. Checkout merged SHA (before step 1)

```bash
cd /home/walt_wood1/ice-network-deploy
git fetch origin
git checkout <merged SHA being deployed>
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

### First upgrade that introduced `getUpgradeCounts` (historical)

1. Master UI → Profile → Site stats: record `registeredAccounts`, `totalPosts`, `visiblePosts`, `hiddenPosts`, `totalProfiles`, `totalComments`.
2. Controller dfx sanity (ogsk6 has posts; gmtr2 empty is expected):

```bash
dfx canister call ice getPostsByAuthor "(principal \"ogsk6-lwnep-oa422-nqvac-puciz-6fbaw-emuqb-xi6ay-ga75u-3e5rh-jae\", 20)" --network ic
```

Save counts under `docs/upgrade-counts-pre-THIS.md` (counts only — no post bodies).  
**STOP** if `totalPosts` or `totalProfiles` are zero.

### Next upgrades (including PR #20 Motoko follow-up)

```bash
dfx canister call ice getUpgradeCounts --network ic > /tmp/upgrade-counts-pre.txt
# Copy the numeric fields into docs/upgrade-counts-pre.json (counts only)
```

Must be non-zero for `posts` and `profiles`. Trap or zeros → **STOP** (wrong identity or canister).

## 3. Snapshot (mandatory)

```bash
dfx canister stop ice --network ic
dfx canister snapshot create ice --network ic   # record THIS run's snapshot id in docs
```

If snapshot create fails because a snapshot **already exists** → `dfx canister start ice --network ic`, then **STOP and ask**. Do **not** replace/delete the existing snapshot.

On any other snapshot failure:

```bash
dfx canister start ice --network ic
# STOP the run — no module-hash fallback
```

Record the new snapshot id from this step. That id is the only valid rollback target for step 7 of this run.

## 4. Upgrade (no auto-confirm)

```bash
dfx deploy ice --network ic --mode upgrade --wasm-memory-persistence keep
# Do NOT pass --yes
```

If dfx shows any **stable-compatibility**, **data-loss**, **Candid-incompatibility**, or **persistence mode** prompt → answer **no**, then:

```bash
dfx canister start ice --network ic
```

and **STOP**.

On a clean upgrade:

```bash
dfx canister start ice --network ic
```

## 5. After counts

1. Master UI Site stats again: every field must be **≥** the pre screenshot (`totalPosts`, `profiles`, `registered`, `comments`, etc.).
2. Controller:

```bash
dfx canister call ice getUpgradeCounts --network ic
```

### First-upgrade like-for-like (historical, vs Site stats)

- `getUpgradeCounts.posts` **==** pre `visiblePosts + hiddenPosts`
- `getUpgradeCounts.profiles` **≥** pre `totalProfiles`

### Next-upgrade gate (compare `getUpgradeCounts` to the pre-upgrade `getUpgradeCounts`, field by field)

For the upcoming upgrade whose pre baseline is the post-PR1 record in `docs/upgrade-counts-post.json`:

| Field | Gate |
|-------|------|
| posts | **≥ 25** |
| profiles | **≥ 7** |
| registered | **≥ 8** |
| totalComments | **≥ 1** |
| networkPrivate | **≥ 0** |
| usernameIndex | **== 7** exactly |
| releaseLog | **== 0** exactly |

Any drop (or any non-exact miss on `usernameIndex` / `releaseLog`) → roll back to **this run’s** step-3 snapshot (step 7). Do **not** load an older snapshot.

Save the full post-upgrade `getUpgradeCounts` record as the baseline for the following upgrade (counts only in-repo).

## 6. Hold smoke (test identities only)

Use **test** Internet Identities only — do not rename or hold-smoke real member accounts.

1. Rename a test account once → `getPrincipalByUsername(old)` still returns same principal.
2. Second test principal claiming old name → `"Username already taken"`.
3. Fourth new key while 3 held → hold-limit error.

## 7. Rollback

Load **only** the snapshot id created in **step 3 of THIS run**.  
Do **not** load `00000000000000000000000001b0f32d0101` (or any other prior-run id). That id is the pre-PR1 snapshot; loading it would undo the username hold and every change since the first upgrade.

```bash
dfx canister stop ice --network ic
dfx canister snapshot load ice <SNAPSHOT_ID_FROM_STEP_3_OF_THIS_RUN> --network ic
dfx canister start ice --network ic
```

Do **not** reinstall an old WASM over newer state.

## Featured posts + displayName (PR featured-feed-displayname)

- Stable side maps only: `postFeaturedEntries`, `displayNameEntries`. **Do not change `type Post` or `UserProfile`.**
- Feature allow-list: General | Ideas | Product. Masters set category via `adminSetPostCategory` before `adminSetPostFeatured(true)`.
- `setDisplayName`: human-readable (letters/digits/spaces/./-/', 1–40); optional; not a URL handle. Handles stay on `setProfile` + username hold.
- Pre/post upgrade: same `getUpgradeCounts` gate + mandatory snapshot. Smoke after upgrade: `getFeaturedPosts(5)` (may be empty), candid methods present.
- **Stop before deploy** until explicit GO; never `--yes`; never reinstall.
