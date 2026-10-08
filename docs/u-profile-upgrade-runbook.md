# Ice upgrade runbook — username hold (PR1)

Canister: `6jf55-2qaaa-aaaan-q6mwq-cai`  
Identity: `mynewdeploy` (controller)  
Mode: **upgrade only** — never reinstall  
Rollback: **load pre-upgrade snapshot only** — never reinstall previous WASM over newer state

## 1. Preflight

```bash
dfx identity use mynewdeploy
dfx canister status ice --network ic   # note cycles; abort if too low
dfx build ice --network ic
```

Record git SHA of merged PR1.

## 2. Before counts

### This deploy only (before `getUpgradeCounts` exists on-chain)

1. Master UI → Profile → Site stats: screenshot `totalPosts`, `totalProfiles`, `registeredAccounts`, `totalComments`.
2. Controller dfx sanity:

```bash
dfx canister call ice getPostsByAuthor "(principal \"gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae\", 20)" --network ic
```

Save under `docs/upgrade-counts-pre-THIS.md`.  
**STOP** if posts or profiles are zero.

### Next upgrades

```bash
dfx canister call ice getUpgradeCounts --network ic > docs/upgrade-counts-pre.json
```

Must be non-zero for `posts` and `profiles`. Trap or zeros → **STOP** (wrong identity or canister).

## 3. Snapshot (mandatory)

```bash
dfx canister stop ice --network ic
dfx canister snapshot create ice --network ic   # record snapshot id
# On failure:
#   dfx canister start ice --network ic
#   STOP the run — no module-hash fallback
```

## 4. Upgrade

```bash
dfx deploy ice --network ic --mode upgrade --yes
# Abort if dfx warns stable-incompatible / data-loss
dfx canister start ice --network ic
```

## 5. After counts

```bash
dfx canister call ice getUpgradeCounts --network ic > docs/upgrade-counts-post.json
```

Every field must be **equal or higher** than pre.

## 6. Hold smoke

1. Rename a test account once → `getPrincipalByUsername(old)` still returns same principal.
2. Second principal claiming old name → `"Username already taken"`.
3. Fourth new key while 3 held → hold-limit error.

## 7. Rollback

```bash
dfx canister stop ice --network ic
dfx canister snapshot load ice <SNAPSHOT_ID> --network ic
dfx canister start ice --network ic
```

Do **not** reinstall an old WASM over newer state.
