# ICE Registry + Detach / Reattach

## Architecture

| Canister | Role |
|----------|------|
| **Factory** (`xfwx3-7yaaa-aaaas-qgxpq-cai`) | Mints `user_site` canisters, detach/reattach, cycles |
| **Registry** (`tihtb-myaaa-aaaas-qgxvq-cai`) | Permanent list of every canister ID the Factory minted. **Only Factory writes.** |
| **user_site** | Per-user site. Cannot call Registry or mutate Factory. |

### Flows

1. **Mint** (`createUserSite` / `adminCreateUserSite` / provision)  
   - Create canister, install WASM, set controllers  
   - `Registry.registerMint(cid, owner)`  
   - Factory maps: `userCanisters`, `siteOwners`, `lastSite`

2. **Detach**  
   - Require domain + DNS ready  
   - Charge detach fee (ICRC-2 from II)  
   - `site.onDetach()`  
   - Remove from live `userCanisters` (network index)  
   - Keep canister + controllers + data  
   - `Registry.markDetached(cid)` (mint record stays)

3. **Reattach** (`relink`)  
   - `Registry.isEligibleForReattach(cid)` **must be true** or reject  
   - Verify caller owns the site  
   - Charge reattach fee  
   - `site.onRelink(factory)`  
   - Restore factory maps + `Registry.markRelinked`

User canisters never get write access to Registry or Factory.

## Deployment steps (mainnet)

From a machine with `dfx` and identity `mynewdeploy` (factory controller):

```bash
# 1) Sync sources into WSL project (or work in ice-network/)
bash /mnt/c/Users/walt_/ice-network/scripts/deploy-registry-and-wire.sh
```

Manual equivalent:

```bash
cd ice-network
dfx identity use mynewdeploy

# Create + install Registry
dfx deploy registry --network ic --yes
REG=$(dfx canister id registry --network ic)

# Upgrade Factory with detach enabled + registry hooks
dfx deploy factory --network ic --yes
FACTORY=$(dfx canister id factory --network ic)   # xfwx3-…

# Wire
dfx canister call registry claimOwner --network ic
dfx canister call registry setAuthorizedFactory "(principal \"$FACTORY\")" --network ic
dfx canister call factory adminSetRegistry "(principal \"$REG\")" --network ic
dfx canister call factory adminBackfillRegistry --network ic

# Verify
dfx canister call registry health --network ic --query
dfx canister call factory getRegistryId --network ic --query
```

Then redeploy ScaleSpace frontend assets so My Site shows Detach / Reattach.

## Local

```bash
dfx start --background
dfx deploy registry
dfx deploy factory
dfx deploy user_site
REG=$(dfx canister id registry)
FACTORY=$(dfx canister id factory)
dfx canister call registry claimOwner
dfx canister call registry setAuthorizedFactory "(principal \"$FACTORY\")"
dfx canister call factory claimOwner
dfx canister call factory adminSetRegistry "(principal \"$REG\")"
```

## Frontend

- **Linked** → Network tab: approve detach fee → **Detach**
- **Detached** → Network tab: Registry eligibility → approve reattach fee → **Reattach**
- Detach requires Domain & DNS complete

## Motoko entrypoints

### Registry

- `claimOwner`, `setAuthorizedFactory`
- `registerMint`, `markDetached`, `markRelinked` (factory only)
- `logEmergencyReset` (factory only audit)
- `isFactoryMinted`, `isEligibleForReattach`, `getRecord` (query)

### Factory

- `adminSetRegistry`, `adminBackfillRegistry`, `getRegistryId`
- `detach`, `relink` (reattach)
- `isEligibleForReattach`
- `DETACH_PAUSED = false`
- **Factory reset**
  - `requestFactoryReset()` — controller of **attached** site only; `#reinstall` factory WASM + bootstrap
  - `adminForceResetSite(site)` — factory owner emergency reset
  - `getResetLog`, `listRegisteredSites`
