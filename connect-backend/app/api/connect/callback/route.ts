import { NextRequest, NextResponse } from "next/server";
import {
  COMPLETION_COOKIE,
  completionCookieOptions,
  mintCompletionToken,
} from "@/lib/completion";
import { getEnv } from "@/lib/env";
import { verifyConnectState } from "@/lib/oauth-state";
import { exchangeOAuthCode } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectError(appOrigin: string, reason: string) {
  const u = new URL(appOrigin);
  u.searchParams.set("connect", "error");
  u.searchParams.set("reason", reason.slice(0, 120));
  return NextResponse.redirect(u.toString(), { status: 302 });
}

export async function GET(req: NextRequest) {
  let appOrigin = "https://frostedblocks.com";
  try {
    appOrigin = getEnv().appOrigin;
  } catch {
    /* fall through */
  }

  try {
    const url = new URL(req.url);
    const err = url.searchParams.get("error");
    if (err) {
      return redirectError(
        appOrigin,
        url.searchParams.get("error_description") || err,
      );
    }

    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    if (!code || !stateRaw) {
      return redirectError(appOrigin, "missing_code_or_state");
    }

    const state = verifyConnectState(stateRaw);
    const { stripeUserId } = await exchangeOAuthCode(code);

    const token = mintCompletionToken({
      siteId: state.siteId,
      ownerPrincipal: state.ownerPrincipal,
      accountId: stripeUserId,
    });

    const dest = new URL(appOrigin);
    dest.searchParams.set("connect", "success");
    dest.searchParams.set("site", state.siteId);
    // Hash route helps SPA land on My Site; FE should call /api/connect/result
    dest.hash = `/site/${state.siteId}`;

    const res = NextResponse.redirect(dest.toString(), { status: 302 });
    res.cookies.set(COMPLETION_COOKIE, token, completionCookieOptions(600));
    return res;
  } catch (e) {
    const message = e instanceof Error ? e.message : "callback_failed";
    return redirectError(appOrigin, message);
  }
}
