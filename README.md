# ICE Network (frostedblocks.com)

Full on-chain ICE stack, organized **by canister name**.

| Canister name | Mainnet ID | Role |
|---|---|---|
| **ice** | `6jf55-2qaaa-aaaan-q6mwq-cai` | Social backend (posts, profiles, tips, referrals, LiteAdmin) |
| **messaging** | `6agwb-myaaa-aaaan-q6mxa-cai` | Direct messages |
| **assets** | `6hhqv-baaaa-aaaan-q6mxq-cai` | Frontend (frostedblocks.com) |
| **factory** | `xfwx3-7yaaa-aaaas-qgxpq-cai` | Personal site mint / cycles / transfers |
| **registry** | `tihtb-myaaa-aaaas-qgxvq-cai` | Domain → site registry |
| **user_site** | `sznn6-uqaaa-aaaas-qgxqa-cai` | User-site WASM template (minted copies) |

Brand URL: https://frostedblocks.com  
Lite (Web2 door): https://lite.frostedblocks.com (separate repo: `frostedblocks-lite`)

## Layout

```
ice/           Motoko source for ice canister
messaging/     Motoko source for messaging canister
assets/        Frontend (Vite/React) → assets canister
factory/       Motoko factory
registry/      Motoko registry
user_site/     Motoko user-site template
scripts/       Deploy / ops scripts
docs/          Domain, launch, registry notes
canister_ids.json
```

Each canister folder includes a `CANISTER.md` with its mainnet ID.
