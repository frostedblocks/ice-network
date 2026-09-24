# I.C.E.

Decentralized social platform on the **Internet Computer**.

## Test on Ubuntu (local ICP replica)

### 1. Install tools (once)

```bash
# Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# DFX (Internet Computer SDK)
sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"
# then restart the terminal, or:
source "$HOME/.local/share/dfx/env"
```

### 2. Clone and enter the project

```bash
git clone https://github.com/frostedblocks/ScaleSpace.git
cd ScaleSpace
```

### 3. Start local replica + deploy canisters

```bash
dfx start --background
dfx deploy ice
dfx deploy messaging
# or simply:
dfx deploy
```

This builds Motoko, installs canisters, and generates JS declarations under `frontend/src/declarations/`.

**Note:** Prefer **dfx 0.29.2** on WSL if 0.32+ fails with PocketIC errors (`dfxvm default 0.29.2`).

### 4. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:3000`).

- **Local:** use **Continue (local test login)** to exercise the app.
- **Mainnet:** login with **Internet Identity** → claim master profile on the Profile page (first real user).

### 5. Useful commands

```bash
# Canister IDs
dfx canister id ice
dfx canister id messaging

# Rebuild after Motoko changes
dfx deploy ice

# Stop local network
dfx stop
```

## Deploy to mainnet (IC)

See **[LAUNCH.md](./LAUNCH.md)** for the full checklist (cycles, identity, claim master).

```bash
export DFX_WARNING=-mainnet_plaintext_identity
bash scripts/deploy-mainnet.sh
# App: https://<assets-id>.icp0.io/
```

## Project layout

```
backend/main.mo      → ice canister (posts, tokens, master tools)
messaging/main.mo    → messaging canister
frontend/            → React + Vite UI
dfx.json             → canister config
```

## Notes

- **Payments** start in test mode (free token subscribe). Enable live ICP pricing from Master controls when ready.
- Image upload is deferred; avatar/image fields accept URLs only for now.
- Master profile: first logged-in user can **Claim Master Profile** on the Profile page (use real II on mainnet).
