# PR3 — /u polish evidence

## Bundle
- `index-CgqXk9pN.js` (local production build from this branch)

## Tab titles
| Route | Title |
|-------|-------|
| loading `/u/wood` | `Loading… · ICE Network` |
| `/u/wood` | `Wood (@wood) · ICE Network` |
| `/u/this-user-does-not-exist-xyz` | `Profile not found · ICE Network` |
| `/u/walter%20l.%20wood` | `Walter L. Wood (@walter l. wood) · ICE Network` |

## Time-to-content `/u/wood` (cold, browser)
| | skeleton visible | content (name / not-found) |
|--|--:|--:|
| **Before** (live `frostedblocks.com`, PR2) | 1025 ms | **3174 ms** |
| **After** (local preview, this branch) | 320 ms | **1661 ms** |

Notes: before still used AuthClient boot gate + plain “Loading profile…”; after renders skeleton immediately and runs anonymous queries without waiting on II. Handle casing before was `@Wood`; after `@wood`.

## Screenshots
Desktop 1280 + mobile 390 for skeleton, loaded, missing, and legacy `walter l. wood`.
