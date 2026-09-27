import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { resolveAllowlistedUrl } from "@/lib/allowlist";
import { corsPreflight, jsonCors } from "@/lib/cors";
import { getEnv } from "@/lib/env";
import { getAnonymousSiteActor, optFirst } from "@/lib/ic";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      siteId?: string;
      productId?: number | string;
      successPath?: string;
      cancelPath?: string;
    };

    const siteId = body.siteId?.trim();
    if (!siteId) {
      return jsonCors(req, { error: "siteId is required" }, { status: 400 });
    }
    if (body.productId === undefined || body.productId === null) {
      return jsonCors(req, { error: "productId is required" }, { status: 400 });
    }

    // Reject client-supplied amounts / account ids — only siteId + productId (+ paths)
    const forbidden = [
      "amount",
      "amountCents",
      "price",
      "priceCents",
      "accountId",
      "stripeAccount",
      "currency",
      "application_fee_amount",
    ];
    for (const k of forbidden) {
      if (k in body) {
        return jsonCors(
          req,
          { error: `Do not send ${k}; amounts and Stripe account come from canister` },
          { status: 400 },
        );
      }
    }

    let productId: bigint;
    try {
      productId = BigInt(body.productId);
    } catch {
      return jsonCors(req, { error: "Invalid productId" }, { status: 400 });
    }

    const actor = await getAnonymousSiteActor(siteId);
    const [productOpt, stripeOpt, domain] = await Promise.all([
      actor.getProduct(productId),
      actor.getStripePublic(),
      actor.getDomainStatus(),
    ]);

    const product = optFirst(productOpt);
    if (!product) {
      return jsonCors(req, { error: "Product not found" }, { status: 404 });
    }
    if (!product.active) {
      return jsonCors(req, { error: "Product is not active" }, { status: 400 });
    }

    const stripePublic = optFirst(stripeOpt);
    if (!stripePublic?.accountId) {
      return jsonCors(
        req,
        { error: "Site has no Stripe Connect account configured" },
        { status: 400 },
      );
    }

    const successUrl = resolveAllowlistedUrl(
      siteId,
      domain,
      body.successPath,
      "success",
    );
    const cancelUrl = resolveAllowlistedUrl(
      siteId,
      domain,
      body.cancelPath,
      "cancel",
    );

    const unitAmount = Number(product.priceCents);
    if (!Number.isSafeInteger(unitAmount) || unitAmount <= 0) {
      return jsonCors(req, { error: "Invalid on-canister price" }, { status: 400 });
    }

    const currency = (product.currency || "usd").toLowerCase();
    const { platformFeeBps } = getEnv();
    const stripe = getStripe();

    // Direct charge on connected account. MVP platform fee 0% → omit application_fee_amount.
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: unitAmount,
            product_data: {
              name: product.title.slice(0, 200),
              description: product.description
                ? product.description.slice(0, 500)
                : undefined,
            },
          },
        },
      ],
      metadata: {
        siteId,
        productId: productId.toString(),
        amountCents: unitAmount.toString(),
        currency,
      },
      payment_intent_data: {
        metadata: {
          siteId,
          productId: productId.toString(),
        },
      },
    };

    if (platformFeeBps > 0) {
      const fee = Math.floor((unitAmount * platformFeeBps) / 10_000);
      if (fee > 0) {
        sessionParams.payment_intent_data = {
          ...sessionParams.payment_intent_data,
          application_fee_amount: fee,
        };
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams, {
      stripeAccount: stripePublic.accountId,
    });

    return jsonCors(req, {
      id: session.id,
      url: session.url,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "checkout/session failed";
    const status =
      message.includes("allowlist") ||
      message.includes("Only https") ||
      message.includes("Invalid")
        ? 400
        : 500;
    return jsonCors(req, { error: message }, { status });
  }
}
