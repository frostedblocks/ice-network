# Post-upgrade counts (THIS deploy — after first hold WASM)

Deployed from merged PR #19 tip: `ba785c46332b73e443979990c61976f79deca94f`  
Snapshot (rollback): `00000000000000000000000001b0f32d0101`  
Module hash live: `0x9ad52a57539fd9072605cc144c7636541cc389230fa245585a669897deea9fa0`  
Note: first upgrade used `dfx deploy … --yes` and `--wasm-memory-persistence keep`. Later upgrades must follow the corrected runbook (**no `--yes`**).

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

## Like-for-like gate

| Check | Pre | Post | Result |
|-------|----:|-----:|--------|
| getUpgradeCounts.posts == visible+hidden | 25 | 25 | PASS |
| getUpgradeCounts.profiles ≥ 7 | 7 | 7 | PASS |
| Master Site stats totalPosts ≥ 44 | 44 | *(confirm in master UI)* | pending operator screenshot |
| Master Site stats profiles ≥ 7 | 7 | *(confirm)* | pending |
| Master Site stats registered ≥ 8 | 8 | *(confirm)* | pending |
| Master Site stats comments ≥ 1 | 1 | *(confirm)* | pending |

Raw dfx transcript kept outside the repo under `~/ice-upgrade-raw-logs/`.
