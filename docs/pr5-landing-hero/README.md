# PR5 — Landing hero + first-run copy (frontend-only)

Base: `030a8cad` (PR4 on main). Assets-only. No Motoko / `.did` / declarations / robots / `.well-known` / `.ic-assets`.

## Changes

### Logged-out homepage hero (`PublicLanding.jsx`)
- H1: “Your name. Your page. On-chain, forever free.”
- Subhead: free ICE username ~1 minute via Internet Identity
- Primary CTA: “Claim my free username” → existing `onLogin`/`onJoin` path; disabled until `authClient` ready
- Secondary CTA: “See an example” → real path `/u/wood`
- 3-step strip: Sign in → Pick @handle → Post and share
- Palette: headings `#EAF6FF`, accent `#7dd3fc`, body `#cbd5e1`; reuses `ice-btn-primary`
- Layout: desktop left-aligned ~720px text, CTAs side-by-side; mobile stacked full-width primary, min 44px tap targets

### First-run (logged-in)
- `WelcomeNotice.jsx`: dismissible banner when username exists and zero posts; localStorage dismiss; View my page + Copy link
- `PublicProfileNotice`: skips zero-post users (Welcome covers first-run)
- Own profile / feed empty: “Nothing here yet. Tell people what you're building.”
- Post composer placeholder: “What are you working on this week?”
- Public `/u/` empty unchanged: “No posts yet.”

## Evidence

Local Vite build (`index-BSE2SqLl.js`), served at `:4173`:

| Viewport | Shot |
|----------|------|
| 1280 | `landing-hero-1280.png` |
| 390 | `landing-hero-390.png` |

Verified in shots: H1/subhead/CTAs/3-step strip; secondary `href=/u/wood`; no horizontal overflow at 390.

## Out of scope
- No merge / assets deploy until Design GO
- Auth: derivationOrigin / II login untouched; CTAs reuse existing join/login
