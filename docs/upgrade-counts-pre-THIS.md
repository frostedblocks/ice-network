# Pre-upgrade baseline (THIS deploy — getUpgradeCounts not on-chain yet)

Source: master UI Site stats (user-provided) + controller dfx samples.

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

## Post-upgrade gate (getUpgradeCounts)

Must show (equal or higher):

- posts >= 44
- profiles >= 7
- registered >= 8
- totalComments >= 1

Also record usernameIndex, networkPrivate, releaseLog for the next upgrade baseline.

## Controller dfx samples (sanity)

- Ice cycles / status: docs/upgrade-ice-status-pre.txt (~4.7 T)
- getPostsByAuthor(gmtr2, 20) empty — see docs/upgrade-gmtr2-posts-pre.txt
- getPostsByAuthor(ogsk6, 20) posts present — see docs/upgrade-ogsk6-posts-pre.txt

STOP if totalPosts or totalProfiles had been 0 — they are not.
