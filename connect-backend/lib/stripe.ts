import Stripe from "stripe";
import { getEnv } from "./env";

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripe) return stripe;
  const { stripeSecretKey } = getEnv();
  stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2024-06-20",
    typescript: true,
  });
  return stripe;
}

/** Express OAuth authorize URL (platform fee handled at Checkout; MVP 0%). */
export function buildExpressOAuthUrl(state: string): string {
  const { stripeConnectClientId, connectPublicOrigin } = getEnv();
  const redirectUri = `${connectPublicOrigin}/api/connect/callback`;
  const params = new URLSearchParams({
    response_type: "code",
    client_id: stripeConnectClientId,
    scope: "read_write",
    state,
    redirect_uri: redirectUri,
  });
  // Prefer Express suggested capabilities via Stripe dashboard settings;
  // stripe_user hints keep onboarding on Express-compatible path.
  params.set("stripe_user[business_type]", "individual");
  return `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
}

export async function exchangeOAuthCode(code: string): Promise<{
  stripeUserId: string;
}> {
  const stripeClient = getStripe();
  // stripe.oauth.token is the supported exchange helper
  const result = await stripeClient.oauth.token({
    grant_type: "authorization_code",
    code,
  });
  const accountId = result.stripe_user_id;
  if (!accountId) {
    throw new Error("Stripe OAuth did not return stripe_user_id");
  }
  // access_token unused for Checkout-with-stripeAccount; do not persist or return
  return { stripeUserId: accountId };
}
