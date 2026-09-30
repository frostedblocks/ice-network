import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getEnv } from "@/lib/env";
import { getRecorderSiteActor, optFirst } from "@/lib/ic";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const { stripeWebhookSecret } = getEnv();

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, stripeWebhookSecret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      // Direct-charge Connect events carry the connected account on event.account.
      await handleCheckoutCompleted(session, event.account ?? null);
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook handler failed";
    // Non-2xx so Stripe retries
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  connectedAccountId: string | null,
) {
  const siteId = session.metadata?.siteId?.trim();
  const productIdRaw = session.metadata?.productId?.trim();
  if (!siteId || !productIdRaw) {
    throw new Error("checkout.session.completed missing siteId/productId metadata");
  }

  // Money integrity: trust Stripe amount_total only — never client/metadata amountCents.
  if (session.amount_total == null) {
    throw new Error("checkout.session.completed missing amount_total");
  }
  const amountCents = BigInt(session.amount_total);
  if (amountCents <= BigInt(0)) {
    throw new Error("checkout.session.completed amount_total must be > 0");
  }

  const currency = (session.currency || session.metadata?.currency || "usd").toLowerCase();
  const buyerRef = session.id; // Stripe Checkout Session id — no email/name on-chain

  if (!buyerRef) throw new Error("Missing session.id for buyerRef");

  const eventAccount = connectedAccountId?.trim() ?? "";
  if (!eventAccount) {
    throw new Error(
      "checkout.session.completed missing event.account (Connect connected-account webhook required)",
    );
  }

  const actor = await getRecorderSiteActor(siteId);
  const stripePublic = optFirst(await actor.getStripePublic());
  if (!stripePublic?.accountId?.trim()) {
    throw new Error("Site has no Stripe Connect account configured");
  }
  if (stripePublic.accountId.trim() !== eventAccount) {
    throw new Error(
      "Stripe connected account does not match site stripe accountId",
    );
  }

  const productId = BigInt(productIdRaw);
  const result = await actor.recordReceipt(
    productId,
    buyerRef,
    amountCents,
    currency,
  );

  if ("err" in result && result.err) {
    throw new Error(`recordReceipt failed: ${result.err}`);
  }
}
