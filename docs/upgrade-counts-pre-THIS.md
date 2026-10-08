# Pre-upgrade baseline (THIS deploy — first getUpgradeCounts on-chain)

Source: master UI Site stats (user-provided), taken for the gate immediately before `canister stop`.  
Raw dfx dumps (status, `getPostsByAuthor` bodies) stay **outside** the repo.

## Master Site stats (authoritative for this deploy)

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

Semantics:

- `totalPosts` = `nextPostId` counter (44)
- `visiblePosts + hiddenPosts` = 25 + 0 = **25** ← matches `getUpgradeCounts.posts` (`posts.size()`)

## Post-upgrade gate (like-for-like)

1. Master Site stats again: each field **≥** pre (`totalPosts` ≥ 44, `totalProfiles` ≥ 7, `registeredAccounts` ≥ 8, `totalComments` ≥ 1, …).
2. `getUpgradeCounts()`:
   - `posts` **==** visible + hidden (**25**)
   - `profiles` **≥** 7
3. Save the full `getUpgradeCounts` output as the baseline for the **next** upgrade.

## Controller sanity (no post bodies in-repo)

- `getPostsByAuthor(ogsk6, 20)` — posts present (gmtr2 empty is expected; do not use gmtr2 as the sanity author).
- Ice cycles were healthy (~4.7 T) before stop.

STOP if `totalPosts` or `totalProfiles` had been 0 — they are not.
