import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import fs from "fs";

function readCanisterIds(network) {
  const candidates = [
    // After mainnet deploy, dfx often writes project-root canister_ids.json
    path.resolve(__dirname, "../canister_ids.json"),
    path.resolve(__dirname, `../.dfx/${network}/canister_ids.json`),
    path.resolve(__dirname, "../.dfx/local/canister_ids.json"),
  ];

  for (const idsPath of candidates) {
    if (!fs.existsSync(idsPath)) continue;
    try {
      const ids = JSON.parse(fs.readFileSync(idsPath, "utf8"));
      // Prefer network-specific id, then ic, then local
      const pick = (entry) => {
        if (!entry) return null;
        if (typeof entry === "string") return entry;
        return entry[network] || entry.ic || entry.local || null;
      };
      return {
        ice: pick(ids.ice),
        messaging: pick(ids.messaging),
        internet_identity: pick(ids.internet_identity),
        assets: pick(ids.assets),
        source: idsPath,
      };
    } catch {
      /* try next */
    }
  }
  return null;
}

function readEnvLocal() {
  const envLocal = path.resolve(__dirname, ".env.local");
  const out = {};
  if (!fs.existsSync(envLocal)) return out;
  const text = fs.readFileSync(envLocal, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^CANISTER_ID_([A-Z0-9_]+)=(.+)$/);
    if (!m) continue;
    const value = m[2].trim().replace(/^['"]|['"]$/g, "");
    out[m[1].toLowerCase()] = value;
  }
  return out;
}

function canisterIdsPlugin() {
  return {
    name: "canister-ids",
    config(_, { mode }) {
      const env = loadEnv(mode, process.cwd(), "");
      const network = process.env.DFX_NETWORK || env.DFX_NETWORK || "local";
      const ids = readCanisterIds(network) || {};
      const envLocal = readEnvLocal();

      const ice = process.env.CANISTER_ID_ICE || ids.ice || envLocal.ice;
      const messaging =
        process.env.CANISTER_ID_MESSAGING || ids.messaging || envLocal.messaging;
      const ii =
        process.env.CANISTER_ID_INTERNET_IDENTITY ||
        ids.internet_identity ||
        envLocal.internet_identity;

      const define = {
        "import.meta.env.DFX_NETWORK": JSON.stringify(network),
      };
      if (ice) {
        define["import.meta.env.VITE_CANISTER_ID_ICE"] = JSON.stringify(ice);
      }
      if (messaging) {
        define["import.meta.env.VITE_CANISTER_ID_MESSAGING"] = JSON.stringify(messaging);
      }
      if (ii) {
        define["import.meta.env.VITE_CANISTER_ID_INTERNET_IDENTITY"] = JSON.stringify(ii);
      }

      if (network === "ic" && (!ice || !messaging)) {
        console.warn(
          "[vite] Missing ice/messaging canister IDs for mainnet build. Deploy backends first, then rebuild."
        );
      } else {
        console.log(`[vite] DFX_NETWORK=${network} ice=${ice || "?"} messaging=${messaging || "?"}`);
      }

      return { define };
    },
  };
}

export default defineConfig({
  plugins: [react(), canisterIdsPlugin()],
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // IC asset canisters prefer reasonably sized chunks
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4943",
        changeOrigin: true,
      },
    },
  },
  define: {
    global: "window",
    "process.env": JSON.stringify({}),
    "process.env.DFX_NETWORK": JSON.stringify(process.env.DFX_NETWORK || "local"),
  },
});
