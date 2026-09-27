import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getEnv } from "./env";

export type ConnectOAuthState = {
  siteId: string;
  ownerPrincipal: string;
  nonce: string;
  exp: number;
};

const STATE_TTL_MS = 15 * 60 * 1000;

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
      .update(payloadB64)
      .digest(),
  );
}

export function createConnectState(
  siteId: string,
  ownerPrincipal: string,
): string {
  const payload: ConnectOAuthState = {
    siteId,
    ownerPrincipal,
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + STATE_TTL_MS,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyConnectState(state: string): ConnectOAuthState {
  const parts = state.split(".");
  if (parts.length !== 2) throw new Error("Invalid state format");
  const [payloadB64, sig] = parts;
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid state signature");
  }
  const raw = JSON.parse(fromB64url(payloadB64).toString("utf8")) as ConnectOAuthState;
  if (!raw?.siteId || !raw?.ownerPrincipal || !raw?.nonce || !raw?.exp) {
    throw new Error("Invalid state payload");
  }
  if (Date.now() > raw.exp) throw new Error("State expired");
  return raw;
}
