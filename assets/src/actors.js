import { Actor, HttpAgent } from "@dfinity/agent";
import { idlFactory as iceIdl } from "./declarations/ice/ice.did.js";
import { idlFactory as messagingIdl } from "./declarations/messaging/messaging.did.js";
import { idlFactory as factoryIdl } from "./declarations/factory/factory.did.js";
import { idlFactory as userSiteIdl } from "./declarations/user_site/user_site.did.js";

/**
 * Build authenticated actors after dfx deploy.
 * Uses .did.js IDL files directly (avoids dfx index.js process.env breakage in Vite).
 */

/** Master Factory (ice-network) — mainnet */
export const FACTORY_CANISTER_ID =
  import.meta.env.VITE_CANISTER_ID_FACTORY || "xfwx3-7yaaa-aaaas-qgxpq-cai";

/** ICE assets frontend — custom domains for personal sites point DNS here */
export const ASSETS_CANISTER_ID =
  import.meta.env.VITE_CANISTER_ID_ASSETS || "6hhqv-baaaa-aaaan-q6mxq-cai";

/** Mainnet ICE backend (hardcoded fallback so login never breaks if env missing) */
export const ICE_CANISTER_ID =
  import.meta.env.VITE_CANISTER_ID_ICE ||
  import.meta.env.CANISTER_ID_ICE ||
  "6jf55-2qaaa-aaaan-q6mwq-cai";

/** Mainnet messaging */
export const MESSAGING_CANISTER_ID =
  import.meta.env.VITE_CANISTER_ID_MESSAGING ||
  import.meta.env.CANISTER_ID_MESSAGING ||
  "6agwb-myaaa-aaaan-q6mxa-cai";

/** Brand hosts that run the main ICE app (not per-user personal sites). */
const MAIN_APP_HOSTS = new Set([
  "frostedblocks.com",
  "www.frostedblocks.com",
  "6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io",
  "6hhqv-baaaa-aaaan-q6mxq-cai.raw.icp0.io",
  "6hhqv-baaaa-aaaan-q6mxq-cai.ic0.app",
]);

function getHost() {
  const network = import.meta.env.DFX_NETWORK || import.meta.env.VITE_DFX_NETWORK || "local";
  if (network === "ic") {
    return "https://icp-api.io";
  }
  return "http://127.0.0.1:4943";
}

async function makeAgent(identity) {
  const host = getHost();
  const agent = await HttpAgent.create({
    host,
    identity,
  });

  const network = import.meta.env.DFX_NETWORK || import.meta.env.VITE_DFX_NETWORK || "local";
  if (network !== "ic") {
    await agent.fetchRootKey();
  }

  return agent;
}

export async function createIceActor(identity) {
  const canisterId = ICE_CANISTER_ID;
  const agent = await makeAgent(identity);
  return Actor.createActor(iceIdl, { agent, canisterId });
}

/**
 * Anonymous (unauthenticated) ice actor for public query calls only.
 * Used by the pre-login landing feed.
 */
export async function createAnonymousIceActor() {
  const canisterId = ICE_CANISTER_ID;
  const host = getHost();
  const agent = await HttpAgent.create({ host });
  const network = import.meta.env.DFX_NETWORK || import.meta.env.VITE_DFX_NETWORK || "local";
  if (network !== "ic") {
    await agent.fetchRootKey();
  }
  return Actor.createActor(iceIdl, { agent, canisterId });
}

export async function createMessagingActor(identity) {
  const canisterId = MESSAGING_CANISTER_ID;
  const agent = await makeAgent(identity);
  return Actor.createActor(messagingIdl, { agent, canisterId });
}

/** Anonymous messaging actor for public guest contact (pre-sign-in). */
export async function createAnonymousMessagingActor() {
  const canisterId = MESSAGING_CANISTER_ID;
  const host = getHost();
  const agent = await HttpAgent.create({ host });
  const network = import.meta.env.DFX_NETWORK || import.meta.env.VITE_DFX_NETWORK || "local";
  if (network !== "ic") {
    await agent.fetchRootKey();
  }
  return Actor.createActor(messagingIdl, { agent, canisterId });
}

export async function createFactoryActor(identity) {
  const agent = await makeAgent(identity);
  return Actor.createActor(factoryIdl, {
    agent,
    canisterId: FACTORY_CANISTER_ID,
  });
}

/** Anonymous factory for public domain → site lookup */
export async function createAnonymousFactoryActor() {
  const host = getHost();
  const agent = await HttpAgent.create({ host });
  const network = import.meta.env.DFX_NETWORK || import.meta.env.VITE_DFX_NETWORK || "local";
  if (network !== "ic") {
    await agent.fetchRootKey();
  }
  return Actor.createActor(factoryIdl, {
    agent,
    canisterId: FACTORY_CANISTER_ID,
  });
}

/**
 * True when this host runs the main ICE app (login / feed / master),
 * not a personal-site custom domain viewer.
 */
export function isPlatformHost(hostname = window.location.hostname) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h === "localhost" || h.startsWith("127.") || h.endsWith(".localhost")) return true;
  if (MAIN_APP_HOSTS.has(h)) return true;
  if (h.includes("icp0.io") || h.includes("ic0.app") || h.includes("icp-api.io")) return true;
  if (h.includes("raw.icp0.io") || h.includes("icp.org")) return true;
  // Brand domain(s)
  if (h === "frostedblocks.com" || h.endsWith(".frostedblocks.com")) return true;
  return false;
}

/**
 * Resolve personal site canister from current custom hostname via factory.
 * Returns principal text or null.
 */
export async function resolveSiteByHostname(hostname = window.location.hostname) {
  if (isPlatformHost(hostname)) return null;
  try {
    const factory = await createAnonymousFactoryActor();
    if (!factory.getSiteByDomain) return null;
    const opt = await factory.getSiteByDomain(hostname);
    const site = Array.isArray(opt) ? opt[0] : opt;
    if (!site) return null;
    return site.toText ? site.toText() : String(site);
  } catch (e) {
    console.error("resolveSiteByHostname", e);
    return null;
  }
}

export async function createUserSiteActor(identity, siteCanisterId) {
  if (!siteCanisterId) {
    throw new Error("Missing personal site canister id");
  }
  const agent = await makeAgent(identity);
  const id =
    typeof siteCanisterId === "string"
      ? siteCanisterId
      : siteCanisterId.toText
      ? siteCanisterId.toText()
      : String(siteCanisterId);
  return Actor.createActor(userSiteIdl, { agent, canisterId: id });
}

/**
 * Anonymous user_site actor for public read-only site pages.
 */
export async function createAnonymousUserSiteActor(siteCanisterId) {
  if (!siteCanisterId) {
    throw new Error("Missing personal site canister id");
  }
  const id =
    typeof siteCanisterId === "string"
      ? siteCanisterId
      : siteCanisterId.toText
      ? siteCanisterId.toText()
      : String(siteCanisterId);
  const host = getHost();
  const agent = await HttpAgent.create({ host });
  const network = import.meta.env.DFX_NETWORK || import.meta.env.VITE_DFX_NETWORK || "local";
  if (network !== "ic") {
    await agent.fetchRootKey();
  }
  return Actor.createActor(userSiteIdl, { agent, canisterId: id });
}

/** Public hash URL for a personal site (works on assets SPA). */
export function publicSiteHash(siteCanisterId, pageId = null) {
  const id =
    typeof siteCanisterId === "string"
      ? siteCanisterId
      : siteCanisterId?.toText?.() || String(siteCanisterId || "");
  if (!id) return "#/";
  if (pageId && pageId !== "profile") {
    return `#/site/${id}/${encodeURIComponent(pageId)}`;
  }
  return `#/site/${id}`;
}

/**
 * Parse public site route from location.
 * Supports: #/site/<canisterId>[/<pageId>] and ?site=<canisterId>&page=<pageId>
 */
export function parsePublicSiteRoute(loc = window.location) {
  try {
    const params = new URLSearchParams(loc.search || "");
    const qSite = params.get("site");
    if (qSite && qSite.trim()) {
      return {
        siteId: qSite.trim(),
        pageId: (params.get("page") || "").trim() || null,
      };
    }
    const raw = (loc.hash || "").replace(/^#/, "").replace(/^\//, "");
    const parts = raw.split("/").filter(Boolean);
    if (parts[0] === "site" && parts[1]) {
      return {
        siteId: decodeURIComponent(parts[1]),
        pageId: parts[2] ? decodeURIComponent(parts[2]) : null,
      };
    }
  } catch (_) {}
  return null;
}
