import { NextRequest } from "next/server";
import type Stripe from "stripe";
import { resolveAllowlistedUrl } from "@/lib/allowlist";
import {
  corsPreflight,
  jsonCors,
  siteAllowedOrigin,
  staticAllowedOrigin,
} from "@/lib/cors";
import { getEnv } from "@/lib/env";
import { getAnonymousSiteActor, optFirst, type DomainStatus } from "@/lib/ic";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadDomain(siteId: string): Promise<DomainStatus | null> {
  try {
    const actor = await getAnonymousSiteActor(siteId);
    return await actor.getDomainStatus();
  } catch {
    return null;
  }
}

/**
 * OPTIONS: prefer ?siteId= so custom-domain Origin can be allowlisted via
 * canister getDomainStatus (browsers send preflight without a JSON body).
 */
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin");
  const siteId = req.nextUrl.searchParams.get("siteId")?.trim() || "";
  let allowOrigin = staticAllowedOrigin(origin);
  if (!allowOrigin && siteId) {
    const domain = await loadDomain(siteId);
    allowOrigin = siteAllowedOrigin(origin, siteId, domain);
  }
  return corsPreflight(req, { allowOrigin });
}

export async function POST(req: NextRequest) {
  const requestOrigin = req.headers.get("origin");
  let allowOrigin = staticAllowedOrigin(requestOrigin);

  try {
    const body = (await req.json()) as {
      siteId?: string;
      productId?: number | string;
      successPath?: string;
      cancelPath?: string;
      successUrl?: string;
      cancelUrl?: string;
    };

    const siteId =
      body.siteId?.trim() ||
      req.nextUrl.searchParams.get("siteId")?.trim() ||
      "";
    if (!siteId) {
      return jsonCors(
        req,
        { error: "siteId is required" },
        { status: 400, allowOrigin },
      );
    }
    if (body.productId === undefined || body.productId === null) {
      return jsonCors(
        req,
        { error: "productId is required" },
        { status: 400, allowOrigin },
      );
    }

    // Reject client-supplied amounts / account ids / absolute redirect URLs.
    // FE must send relative successPath/cancelPath; backend builds absolute URLs
    // from the allowlisted Origin (no open redirects).
    const forbidden = [
      "amount",
      "amountCents",
      "price",
      "priceCents",
      "accountId",
      "stripeAccount",
      "currency",
      "application_fee_amount",
      "successUrl",
      "cancelUrl",
    ];
    for (const k of forbidden) {
      if (k in body) {
        return jsonCors(
          req,
          {
            error:
              k === "successUrl" || k === "cancelUrl"
                ? `Do not send ${k}; use relative successPath/cancelPath`
                : `Do not send ${k}; amounts and Stripe account come from canister`,
          },
          { status: 400, allowOrigin },
        );
      }
    }

    let productId: bigint;
    try {
      productId = BigInt(body.productId);
    } catch {
      return jsonCors(
        req,
        { error: "Invalid productId" },
        { status: 400, allowOrigin },
      );
    }

    const actor = await getAnonymousSiteActor(siteId);
    const [productOpt, stripeOpt, domain] = await Promise.all([
      actor.getProduct(productId),
      actor.getStripePublic(),
      actor.getDomainStatus(),
    ]);

    allowOrigin = siteAllowedOrigin(requestOrigin, siteId, domain);

    const product = optFirst(productOpt);
    if (!product) {
      return jsonCors(
        req,
        { error: "Product not found" },
        { status: 404, allowOrigin },
      );
    }
    if (!product.active) {
      return jsonCors(
        req,
        { error: "Product is not active" },
        { status: 400, allowOrigin },
      );
    }

    const stripePublic = optFirst(stripeOpt);
    if (!stripePublic?.accountId) {
      return jsonCors(
        req,
        { error: "Site has no Stripe Connect account configured" },
        { status: 400, allowOrigin },
      );
    }

    const successUrl = resolveAllowlistedUrl(
      siteId,
      domain,
      body.successPath,
      "success",
      requestOrigin,
    );
    const cancelUrl = resolveAllowlistedUrl(
      siteId,
      domain,
      body.cancelPath,
      "cancel",
      requestOrigin,
    );

    const unitAmount = Number(product.priceCents);
    if (!Number.isSafeInteger(unitAmount) || unitAmount <= 0) {
      return jsonCors(
        req,
        { error: "Invalid on-canister price" },
        { status: 400, allowOrigin },
      );
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
    }, { allowOrigin });
  } catch (e) {
    const message = e instanceof Error ? e.message : "checkout/session failed";
    const status =
      message.includes("allowlist") ||
      message.includes("Only https") ||
      message.includes("Invalid")
        ? 400
        : 500;
    return jsonCors(req, { error: message }, { status, allowOrigin });
  }
}
