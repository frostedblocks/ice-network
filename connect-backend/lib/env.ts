/**
 * Server-only env access. Never import this from client components.
 */

function required(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

/** Parse comma-separated https origins (trailing slash stripped). */
function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) continue;
    try {
      const u = new URL(t);
      if (u.protocol === "https:" || u.hostname === "localhost") {
        out.push(u.origin);
      }
    } catch {
      /* skip invalid */
    }
  }
  return out;
}

export function getEnv() {
  return {
    stripeSecretKey: required("STRIPE_SECRET_KEY"),
    stripeWebhookSecret: required("STRIPE_WEBHOOK_SECRET"),
    stripePublishableKey: required("STRIPE_PUBLISHABLE_KEY"),
    /** Platform Connect OAuth client id (ca_…). Required for Express OAuth. */
    stripeConnectClientId: required("STRIPE_CONNECT_CLIENT_ID"),
    connectOauthStateSecret: required("CONNECT_OAUTH_STATE_SECRET"),
    appOrigin: required("NEXT_PUBLIC_APP_ORIGIN").replace(/\/$/, ""),
    connectPublicOrigin: required("CONNECT_PUBLIC_ORIGIN").replace(/\/$/, ""),
    icHost: optional("IC_HOST") || "https://icp-api.io",
    /** MVP platform fee percent (0 = omit application_fee_amount). */
    platformFeeBps: Number(optional("CONNECT_PLATFORM_FEE_BPS") || "0"),
    /**
     * Extra browser origins allowed for CORS (and checkout return bases).
     * Comma-separated absolute origins, e.g. https://shop.example.com,https://staging.frostedblocks.com
     * Custom domains are also allowed per-request when they match canister getDomainStatus.
     */
    allowedOrigins: parseAllowedOrigins(optional("ALLOWED_ORIGINS")),
  };
}

export function getIcIdentityMaterial(): {
  pem?: string;
  seed?: string;
} {
  const pem = optional("CONNECT_BACKEND_IC_IDENTITY_PEM");
  const seed = optional("CONNECT_BACKEND_IC_SEED");
  if (!pem && !seed) {
    throw new Error(
      "Set CONNECT_BACKEND_IC_IDENTITY_PEM or CONNECT_BACKEND_IC_SEED",
    );
  }
  return { pem, seed };
}
