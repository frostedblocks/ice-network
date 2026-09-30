import { NextRequest } from "next/server";
import { corsPreflight, jsonCors } from "@/lib/cors";
import { mintOwnerChallenge } from "@/lib/owner-proof";
import { Principal } from "@dfinity/principal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

/**
 * Issue a short-lived HMAC challenge bound to siteId.
 * Caller must later prove II/session control in POST /api/connect/start.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { siteId?: string };
    const siteId = body.siteId?.trim();
    if (!siteId) {
      return jsonCors(req, { error: "siteId is required" }, { status: 400 });
    }
    try {
      Principal.fromText(siteId);
    } catch {
      return jsonCors(
        req,
        { error: "Invalid siteId (expected canister principal)" },
        { status: 400 },
      );
    }

    const challenge = mintOwnerChallenge(siteId);
    return jsonCors(req, {
      challenge,
      expiresInSec: 300,
      /**
       * Client must POST /api/connect/start with:
       * { siteId, challenge, sessionIdentity, delegation? }
       * where sessionIdentity is Ed25519KeyIdentity.toJSON() and delegation
       * is DelegationChain.toJSON() when using Internet Identity.
       */
      proofHint:
        "Sign-in session: send sessionIdentity (Ed25519 JSON) + optional II delegation chain with this challenge",
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "connect/challenge failed";
    return jsonCors(req, { error: message }, { status: 500 });
  }
}
