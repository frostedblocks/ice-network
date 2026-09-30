import { NextRequest, NextResponse } from "next/server";
import type { DomainStatus } from "./ic";
import { allowedBases } from "./allowlist";
import { getEnv } from "./env";

/** ICP asset / canister browser origins (https only). */
export function isIcpAssetsOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return (
      h.endsWith(".icp0.io") ||
      h.endsWith(".raw.icp0.io") ||
      h.endsWith(".ic0.app") ||
      h.endsWith(".raw.ic0.app")
    );
  } catch {
    return false;
  }
}

/**
 * Static CORS allowlist (no canister lookup):
 * - NEXT_PUBLIC_APP_ORIGIN (frostedblocks.com)
 * - ALLOWED_ORIGINS env
 * - *.icp0.io / *.ic0.app (and raw variants)
 */
export function staticAllowedOrigin(origin: string | null): string | null {
  if (!origin) return null;
  try {
    const o = new URL(origin);
    if (o.protocol !== "https:" && o.hostname !== "localhost") return null;

    const { appOrigin, allowedOrigins } = getEnv();
    try {
      if (o.origin === new URL(appOrigin).origin) return o.origin;
    } catch {
      /* env may be missing during build */
    }
    for (const extra of allowedOrigins) {
      if (o.origin === extra) return o.origin;
    }
    if (isIcpAssetsOrigin(origin)) return o.origin;
  } catch {
    return null;
  }
  return null;
}

/**
 * Checkout / Buy: also allow Origin when it matches the site's custom domain
 * or publicUrl from getDomainStatus (https only). Never reflects arbitrary hosts.
 */
export function siteAllowedOrigin(
  origin: string | null,
  siteId: string,
  domain: DomainStatus | null,
): string | null {
  const fromStatic = staticAllowedOrigin(origin);
  if (fromStatic) return fromStatic;
  if (!origin || !siteId) return null;
  try {
    const o = new URL(origin);
    if (o.protocol !== "https:") return null;
    const { origins } = allowedBases(siteId, domain);
    if (origins.has(o.origin.toLowerCase())) return o.origin;
  } catch {
    return null;
  }
  return null;
}

function allowedOrigin(origin: string | null): string | null {
  return staticAllowedOrigin(origin);
}

export function corsHeaders(
  req: NextRequest,
  opts?: { allowOrigin?: string | null },
): HeadersInit {
  const origin =
    opts?.allowOrigin !== undefined
      ? opts.allowOrigin
      : allowedOrigin(req.headers.get("origin"));
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
  return headers;
}

export function withCors(
  req: NextRequest,
  res: NextResponse,
  opts?: { allowOrigin?: string | null },
): NextResponse {
  const extra = corsHeaders(req, opts);
  for (const [k, v] of Object.entries(extra)) {
    res.headers.set(k, v);
  }
  return res;
}

export function corsPreflight(
  req: NextRequest,
  opts?: { allowOrigin?: string | null },
): NextResponse {
  return withCors(req, new NextResponse(null, { status: 204 }), opts);
}

export function jsonCors(
  req: NextRequest,
  body: unknown,
  init: { status?: number; allowOrigin?: string | null } = {},
): NextResponse {
  return withCors(
    req,
    NextResponse.json(body, { status: init.status ?? 200 }),
    { allowOrigin: init.allowOrigin },
  );
}
