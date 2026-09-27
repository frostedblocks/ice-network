import { createHmac, timingSafeEqual } from "crypto";
import { getEnv } from "./env";

export const COMPLETION_COOKIE = "ice_connect_done";
const COMPLETION_TTL_MS = 10 * 60 * 1000;

export type CompletionPayload = {
  siteId: string;
  ownerPrincipal: string;
  accountId: string;
  exp: number;
  used?: boolean;
};

function b64url(buf: Buffer | string): string {
  const b = typeof buf === "string" ? Buffer.from(buf, "utf8") : buf;
  return b
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function sign(payloadB64: string): string {
  const { connectOauthStateSecret } = getEnv();
  return b64url(
    createHmac("sha256", connectOauthStateSecret)
      .update(`completion:${payloadB64}`)
      .digest(),
  );
}

export function mintCompletionToken(input: {
  siteId: string;
  ownerPrincipal: string;
  accountId: string;
}): string {
  const payload: CompletionPayload = {
    siteId: input.siteId,
    ownerPrincipal: input.ownerPrincipal,
    accountId: input.accountId,
    exp: Date.now() + COMPLETION_TTL_MS,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function parseCompletionToken(token: string): CompletionPayload {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid completion token");
  const [payloadB64, sig] = parts;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid completion signature");
  }
  const raw = JSON.parse(
    fromB64url(payloadB64).toString("utf8"),
  ) as CompletionPayload;
  if (!raw?.siteId || !raw?.accountId || !raw?.ownerPrincipal || !raw?.exp) {
    throw new Error("Invalid completion payload");
  }
  if (Date.now() > raw.exp) throw new Error("Completion token expired");
  return raw;
}

/** One-time consume: re-sign with used=true so a replay fails equality checks below. */
export function markCompletionUsed(token: string): string {
  const payload = parseCompletionToken(token);
  const next: CompletionPayload = { ...payload, used: true, exp: payload.exp };
  const payloadB64 = b64url(JSON.stringify(next));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function completionCookieOptions(maxAgeSec = 600) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "none" as const,
    path: "/",
    maxAge: maxAgeSec,
  };
}
