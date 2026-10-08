# PR5 evidence — landing hero + first-run copy

**Bundle:** `index-C6sDN9oP.js` (vite build, DFX_NETWORK=ic)

## Screenshots

| Shot | File |
|------|------|
| Before homepage 1280 (live) | `before-home-1280.png` |
| Before homepage 390 (live) | `before-home-390.png` |
| After homepage 1280 | `after-home-1280.png` |
| After homepage 1200 | `after-home-1200.png` |
| After homepage 1199 | `after-home-1199.png` |
| After homepage 1024 | `after-home-1024.png` |
| After homepage 960 | `after-home-960.png` |
| After homepage 390 | `after-home-390.png` |
| See an example → `/u/wood` | `after-example-u-wood-1280.png` |
| Primary CTA → II window | `after-ii-window-open.png` |
| Welcome notice | `after-welcome-fixture.png` |
| Empty state | `after-empty-fixture.png` |
| Composer placeholder | `after-composer-fixture.png` |

## Breakpoint fix (Design NO-GO #2)

- Steps: 1-column below 1200px; 3-column only at `min-width: 1200px`.
- `stepText` `overflowWrap: break-word` (was anywhere).
- Hero CTAs: `whiteSpace: nowrap` + row `flex-wrap` so labels stay one line and stack if needed.
- Verified at 1280 / 1200 / 1199 / 1024 / 960 / 390: no mid-word breaks, no overflow, CTA labels one line.

## Overflow fix (Design NO-GO #1)

- `stepTitle` / `stepText`: `minWidth: 0`; step grid column `minmax(0,1fr)`.
- Header CTA: Sign in; auth-note CTA: Claim my free username.

## STOP

No merge / assets deploy until Design GO.
