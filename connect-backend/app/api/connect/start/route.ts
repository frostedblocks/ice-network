import { NextRequest } from "next/server";
import { corsPreflight, jsonCors } from "@/lib/cors";
import { assertOwnerProof, type OwnerProofBody } from "@/lib/owner-proof";
import { createConnectState } from "@/lib/oauth-state";
import { buildExpressOAuthUrl } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

/**
 * Start Stripe Express OAuth for a site.
 *
 * Requires cryptographic owner proof (challenge + II/session identity).
 * A bare ownerPrincipal string is NOT accepted — that was the payout-hijack bug.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as OwnerProofBody & {
      /** @deprecated Ignored — do not trust client-supplied principal alone */
      ownerPrincipal?: string;
    };

    const siteId = body.siteId?.trim();
    if (!siteId) {
      return jsonCors(req, { error: "siteId is required" }, { status: 400 });
    }
    if (!body.challenge || body.sessionIdentity == null) {
      return jsonCors(
        req,
        {
          error:
            "Owner proof required: POST /api/connect/challenge first, then send { siteId, challenge, sessionIdentity, delegation? }",
        },
        { status: 401 },
      );
    }

    const { ownerPrincipal } = await assertOwnerProof({
      siteId,
      challenge: body.challenge,
      sessionIdentity: body.sessionIdentity,
      delegation: body.delegation,
    });

    const state = createConnectState(siteId, ownerPrincipal);
    const url = buildExpressOAuthUrl(state);
    return jsonCors(req, { url, ownerPrincipal });
  } catch (e) {
    const message = e instanceof Error ? e.message : "connect/start failed";
    const status =
      message.includes("does not match") ||
      message.includes("Invalid") ||
      message.includes("required") ||
      message.includes("expired") ||
      message.includes("already used") ||
      message.includes("failed") ||
      message.includes("Anonymous") ||
      message.includes("proof")
        ? 403
        : 500;
    return jsonCors(req, { error: message }, { status });
  }
}
