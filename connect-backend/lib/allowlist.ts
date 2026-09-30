import { getEnv } from "./env";
import type { DomainStatus } from "./ic";

/** Mirrors assets/src/actors.js publicSiteHash */
export function publicSiteHash(siteCanisterId: string, pageId: string | null = null): string {
  const id = siteCanisterId.trim();
  if (!id) return "#/";
  if (pageId && pageId !== "profile") {
    return `#/site/${id}/${encodeURIComponent(pageId)}`;
  }
  return `#/site/${id}`;
}

function normalizeOrigin(url: URL): string {
  return url.origin.toLowerCase();
}

function hostFromCustom(domain: string): string | null {
  const d = domain.trim().toLowerCase().replace(/\.$/, "");
  if (!d) return null;
  // Reject weird input
  if (d.includes("/") || d.includes(" ") || d.includes("://")) return null;
  return d;
}

/**
 * Allowed success/cancel base origins for a site:
 * - custom domain from getDomainStatus (https only) when set
 * - https://{siteId}.icp0.io
 * - https://{siteId}.raw.icp0.io
 * - https://frostedblocks.com (NEXT_PUBLIC_APP_ORIGIN) with publicSiteHash for that site
 * - ALLOWED_ORIGINS env extras
 */
export function allowedBases(
  siteId: string,
  domain: DomainStatus | null,
): { origins: Set<string> } {
  const { appOrigin, allowedOrigins } = getEnv();
  const origins = new Set<string>();

  origins.add(`https://${siteId}.icp0.io`);
  origins.add(`https://${siteId}.raw.icp0.io`);

  try {
    origins.add(normalizeOrigin(new URL(appOrigin)));
  } catch {
    /* ignore */
  }

  for (const extra of allowedOrigins) {
    try {
      origins.add(normalizeOrigin(new URL(extra)));
    } catch {
      /* ignore */
    }
  }

  if (domain?.customDomain) {
    const host = hostFromCustom(domain.customDomain);
    if (host) origins.add(`https://${host}`);
  }
  // Also accept publicUrl origin when it is https
  if (domain?.publicUrl) {
    try {
      const u = new URL(domain.publicUrl);
      if (u.protocol === "https:") origins.add(normalizeOrigin(u));
    } catch {
      /* ignore */
    }
  }

  return { origins };
}

function isPathOnly(raw: string): boolean {
  return raw.startsWith("/") && !raw.startsWith("//");
}

/**
 * Resolve success/cancel URL from optional relative path (preferred) or absolute URL.
 * Relative paths are rooted at the allowlisted request Origin when present,
 * else custom domain / icp0.io. Never trusts arbitrary redirect hosts.
 */
export function resolveAllowlistedUrl(
  siteId: string,
  domain: DomainStatus | null,
  pathOrUrl: string | undefined,
  kind: "success" | "cancel",
  requestOrigin?: string | null,
): string {
  const { origins } = allowedBases(siteId, domain);
  const { appOrigin } = getEnv();
  const app = new URL(appOrigin);

  // Default: frostedblocks public site hash with checkout flag in query
  const defaultUrl = (() => {
    const u = new URL(appOrigin);
    u.searchParams.set("checkout", kind === "success" ? "success" : "cancel");
    u.searchParams.set("site", siteId);
    u.hash = publicSiteHash(siteId).replace(/^#/, "");
    return u.toString();
  })();

  if (!pathOrUrl || !pathOrUrl.trim()) {
    return defaultUrl;
  }

  const raw = pathOrUrl.trim();

  // Relative path → prefer allowlisted request Origin, else custom domain, else icp0.io
  if (isPathOnly(raw)) {
    let baseOrigin: string | null = null;

    if (requestOrigin) {
      try {
        const ro = new URL(requestOrigin);
        if (ro.protocol === "https:" || ro.hostname === "localhost") {
          if (origins.has(normalizeOrigin(ro))) {
            baseOrigin = ro.origin;
          }
        }
      } catch {
        /* ignore bad Origin */
      }
    }

    if (!baseOrigin) {
      const host = domain?.customDomain
        ? hostFromCustom(domain.customDomain)
        : null;
      baseOrigin = host ? `https://${host}` : `https://${siteId}.icp0.io`;
    }

    const u = new URL(raw, baseOrigin);
    if (!origins.has(normalizeOrigin(u))) {
      throw new Error("success/cancel path resolved outside allowlist");
    }
    return u.toString();
  }

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Invalid success/cancel URL");
  }
  if (u.protocol !== "https:") {
    throw new Error("Only https success/cancel URLs are allowed");
  }
  if (!origins.has(normalizeOrigin(u))) {
    throw new Error("success/cancel URL origin not allowlisted");
  }

  // Frostedblocks: require hash or query identifying this site
  if (normalizeOrigin(u) === app.origin) {
    const hash = (u.hash || "").replace(/^#/, "");
    const siteFromHash = hash.match(/^\/?site\/([^/]+)/);
    const siteFromQuery = u.searchParams.get("site");
    const okHash = siteFromHash && siteFromHash[1] === siteId;
    const okQuery = siteFromQuery === siteId;
    if (!okHash && !okQuery) {
      throw new Error(
        "frostedblocks.com return URL must include this site (hash #/site/{siteId} or ?site=)",
      );
    }
  }

  return u.toString();
}
