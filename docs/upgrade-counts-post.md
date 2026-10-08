# Post-upgrade counts (THIS deploy — after first hold WASM)

Deployed from merged PR #19 tip: `ba785c46332b73e443979990c61976f79deca94f`  
Snapshot created before that first upgrade (historical only — **not** the rollback target for later runs): `00000000000000000000000001b0f32d0101`  
Module hash live after PR #19 upgrade: `0x9ad52a57539fd9072605cc144c7636541cc389230fa245585a669897deea9fa0`  
Note: first upgrade used `dfx deploy … --yes` and `--wasm-memory-persistence keep`. Later upgrades follow the corrected runbook (**no `--yes`**; persistence flag on the deploy command).

## getUpgradeCounts (baseline for next upgrade)

| Field | Value |
|-------|------:|
| posts | 25 |
| profiles | 7 |
| registered | 8 |
| totalComments | 1 |
| usernameIndex | 7 |
| networkPrivate | 0 |
| releaseLog | 0 |

## Like-for-like gate (after PR #19 upgrade)

| Check | Pre | Post | Result |
|-------|----:|-----:|--------|
| getUpgradeCounts.posts == visible+hidden | 25 | 25 | PASS |
| getUpgradeCounts.profiles ≥ 7 | 7 | 7 | PASS |
| Master Site stats totalPosts ≥ 44 | 44 | 44 | PASS |
| Master Site stats profiles ≥ 7 | 7 | 7 | PASS |
| Master Site stats registered ≥ 8 | 8 | 8 | PASS |
| Master Site stats comments ≥ 1 | 1 | 1 | PASS |

## Post-upgrade master Site stats (after PR #19 upgrade)

Source: master UI screenshot (operator). All fields match the pre-upgrade baseline.

| Field | Value |
|-------|------:|
| registeredAccounts | 8 |
| totalPosts | 44 |
| visiblePosts | 25 |
| hiddenPosts | 0 |
| totalComments | 1 |
| totalProfiles | 7 |
| accounts with balances | 6 |
| reports | 0 |
| banned | 0 |

Raw dfx transcript kept outside the repo under `~/ice-upgrade-raw-logs/`.
