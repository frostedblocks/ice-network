# ICE Network — Canister Factory

Extends ScaleSpace with a Canister Factory that spins up individual user website canisters on subscription.

## Architecture

- **factory** (master): stores user-site WASM template, provisions new canisters via management canister, tracks subscriptions, injects cycles, indexes feeds.
- **registry**: permanent mint log of every user_site canister ID (Factory-only writes). Gates reattach.
- **user_site** (template): per-user canister with local posts DB, local feed, P2P follow/sync, cycles gauge, owner handover.
- Binds to existing ScaleSpace token/messaging via Principal.

## Workflow

1. User registers on ICE → factory.createUserSite(userPrincipal)
2. Factory mints user_site WASM and **registers the canister ID** in Registry
3. User canister initialized with owner = user Principal
4. **Detach**: unlink from factory index (canister intact); Registry keeps mint record
5. **Reattach**: only if Registry shows factory-minted; foreign canisters rejected

See `REGISTRY_AND_DETACH.md` for deploy steps and Motoko APIs.
