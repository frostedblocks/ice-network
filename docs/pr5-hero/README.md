# PR5 evidence — landing hero + first-run copy

**Bundle:** `index-HVaIQLwG.js` (vite build, DFX_NETWORK=ic)

## Screenshots

| Shot | File |
|------|------|
| Before homepage 1280 (live) | `before-home-1280.png` |
| Before homepage 390 (live) | `before-home-390.png` |
| After homepage 1280 (local) | `after-home-1280.png` |
| After homepage 390 (local) | `after-home-390.png` |
| See an example → `/u/wood` | `after-example-u-wood-1280.png` |
| Primary CTA → II window | `after-ii-window-open.png` |
| Welcome notice | `after-welcome-fixture.png` |
| Empty state | `after-empty-fixture.png` |
| Composer placeholder | `after-composer-fixture.png` |

Welcome / empty / composer fixtures use production `theme.css` classes with the shipped copy (no real II sign-in for those three).

## Verified

- Homepage `<title>`: `ICE Network: free on-chain username and page`
- Homepage meta description: Claim a free @username… (~1 minute)
- `/u/wood` after “See an example”: path `/u/wood`, title `Wood (@wood) · ICE Network`, `data-ice-u` robots `noindex`
- Primary “Claim my free username” opens II authorize window (closed without completing sign-in)
- Built JS contains `Claim my free username` and `forever free`
- `airdrop` / `invest`: 0 hits in bundle
- `token` hits are pre-existing only (Candid `token` field, “not a token sale” disclaimer, Connect challenge token) — none added by PR5 source diff

## Out of scope

No merge / assets deploy until Design GO.
