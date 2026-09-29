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
    const { getRecorderSiteActor } = await import("@/lib/ic");
    const actor = await getRecorderSiteActor(payload.siteId);
    const bindOut = await actor.bindStripePublic(
      payload.accountId,
      stripePublishableKey,
    );
    if (typeof bindOut === "string" && bindOut.toLowerCase().includes("not authorized")) {
      return jsonCors(req, { error: bindOut }, { status: 403 });
    }
    if (typeof bindOut === "string" && !bindOut.toLowerCase().includes("bound") && !bindOut.toLowerCase().includes("saved")) {
      // Still return config to FE for display, but surface bind message
      console.warn("bindStripePublic:", bindOut);
    }

    const res = jsonCors(req, {
      accountId: payload.accountId,
      publishableKey: stripePublishableKey,
      ownerPrincipal: payload.ownerPrincipal,
      siteId: payload.siteId,
      bound: typeof bindOut === "string" ? bindOut : "ok",
    });
    // Clear cookie after one successful read
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
