import { createHash } from "crypto";
import { NextRequest } from "next/server";
import {
  COMPLETION_COOKIE,
  completionCookieOptions,
  parseCompletionToken,
} from "@/lib/completion";
import { corsPreflight, jsonCors } from "@/lib/cors";
import { getEnv } from "@/lib/env";
import { consumeOnce } from "@/lib/used-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

/**
 * After Express OAuth callback: bind Stripe public config via trusted recorder.
 *
 * Completion cookie was minted only after verified connect/start (owner proof)
 * → OAuth state → callback. Before bind we re-load getOwner and require it
 * still matches the cookie's ownerPrincipal (rejects owner change / mismatch).
 * accountId always comes from the signed cookie (Stripe OAuth), never the client.
 */
export async function GET(req: NextRequest) {
  try {
    const siteId = new URL(req.url).searchParams.get("siteId")?.trim();
    if (!siteId) {
      return jsonCors(req, { error: "siteId is required" }, { status: 400 });
    }

    const token = req.cookies.get(COMPLETION_COOKIE)?.value;
    if (!token) {
      return jsonCors(
        req,
        { error: "Missing completion cookie — complete Connect OAuth first" },
        { status: 401 },
      );
    }

    const payload = parseCompletionToken(token);
    if (payload.siteId !== siteId) {
      return jsonCors(
        req,
        { error: "Completion token site mismatch" },
        { status: 403 },
      );
    }
    if (payload.used) {
      return jsonCors(
        req,
        { error: "Completion token already used" },
        { status: 410 },
      );
    }

    // Re-verify on-chain owner matches the principal locked in at verified start.
    const { getAnonymousSiteActor } = await import("@/lib/ic");
    const anon = await getAnonymousSiteActor(payload.siteId);
    const currentOwner = await anon.getOwner();
    if (currentOwner.toText() !== payload.ownerPrincipal) {
      return jsonCors(
        req,
        {
          error:
            "Site owner mismatch vs Connect session — ownership changed or cookie invalid; restart Connect",
        },
        { status: 403 },
      );
    }

    const key = createHash("sha256").update(token).digest("hex");
    if (!consumeOnce(key, payload.exp)) {
      return jsonCors(
        req,
        { error: "Completion token already used" },
        { status: 410 },
      );
    }

    const { stripePublishableKey } = getEnv();
    if (stripePublishableKey.startsWith("sk_")) {
      return jsonCors(
        req,
        { error: "Server misconfigured: publishable key looks secret" },
        { status: 500 },
      );
    }

    // Bind on-canister via trusted recorder — owner cannot paste arbitrary account ids.
    // Never re-enable FE setStripePublic for binding.
    const { getRecorderSiteActor } = await import("@/lib/ic");
    const actor = await getRecorderSiteActor(payload.siteId);
    const bindOut = await actor.bindStripePublic(
      payload.accountId,
      stripePublishableKey,
    );
    if (
      typeof bindOut === "string" &&
      bindOut.toLowerCase().includes("not authorized")
    ) {
      return jsonCors(req, { error: bindOut }, { status: 403 });
    }
    if (
      typeof bindOut === "string" &&
      !bindOut.toLowerCase().includes("bound") &&
      !bindOut.toLowerCase().includes("saved")
    ) {
      console.warn("bindStripePublic:", bindOut);
    }

    const res = jsonCors(req, {
      accountId: payload.accountId,
      publishableKey: stripePublishableKey,
      ownerPrincipal: payload.ownerPrincipal,
      siteId: payload.siteId,
      bound: typeof bindOut === "string" ? bindOut : "ok",
    });
    res.cookies.set(COMPLETION_COOKIE, "", {
      ...completionCookieOptions(0),
      maxAge: 0,
    });
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "connect/result failed";
    return jsonCors(req, { error: message }, { status: 400 });
  }
}
