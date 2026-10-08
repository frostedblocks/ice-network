# PR4 — /u + PublicSite markdown hotfix

## Bundle
`index-Db2xkPNx.js`

## Live pre-check (production PR3)
- `join(" ").trim()` present in SafeMarkdown path; `ice-site-md` absent.

## Built bundle grep (this branch)
- SafeMarkdown uses `join(\`\n\`).trim()` (minified); `join(" ")` gone from that block.
- `ice-site-md` and `ice-md-ul` present.

## Screenshots
| File | What |
|------|------|
| `before-u-wood-ii-post-*` | Live `/u/wood` Internet Identity steps (PR3) |
| `after-u-wood-ii-post-*` | Local after: steps as separate ordered-list lines |
| `before-site-tef3t-*` | Live `/#/site/tef3t-…` Home — `.ice-md-h1` **32px** |
| `after-site-tef3t-*` | Local after — `.ice-md-h1` **22.4px** (`1.4rem`) + `ice-site-md` |

## Also
- `/u` actor: `anonActor || actor`
- Join CTA disabled until `authClient` ready
- `stripUtmParams` returns input unchanged for non-http(s)
