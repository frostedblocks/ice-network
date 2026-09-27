import { NextRequest } from "next/server";
import { corsPreflight, jsonCors } from "@/lib/cors";
import { assertSiteOwner } from "@/lib/ic";
import { createConnectState } from "@/lib/oauth-state";
import { buildExpressOAuthUrl } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      siteId?: string;
      ownerPrincipal?: string;
    };
    const siteId = body.siteId?.trim();
    const ownerPrincipal = body.ownerPrincipal?.trim();
    if (!siteId || !ownerPrincipal) {
      return jsonCors(
        req,
        { error: "siteId and ownerPrincipal are required" },
        { status: 400 },
      );
    }

    await assertSiteOwner(siteId, ownerPrincipal);

    const state = createConnectState(siteId, ownerPrincipal);
    const url = buildExpressOAuthUrl(state);
    return jsonCors(req, { url });
  } catch (e) {
    const message = e instanceof Error ? e.message : "connect/start failed";
    const status =
      message.includes("does not match") || message.includes("Invalid")
        ? 403
        : 500;
    return jsonCors(req, { error: message }, { status });
  }
}
