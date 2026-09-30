/**
 * Cryptographic owner proof for Stripe Connect start.
 *
 * Do NOT trust a bare ownerPrincipal string. Callers must prove control of an
 * II (or local Ed25519) session whose principal equals canister getOwner.
 *
 * Flow:
 *  1. POST /api/connect/challenge → HMAC-signed challenge bound to siteId
 *  2. FE sends Ed25519 session key JSON + optional DelegationChain JSON
 *     (II) with that challenge. Session key is short-lived (II session);
 *     treated like a bearer secret over HTTPS to this trusted backend.
 *  3. Backend reconstructs DelegationIdentity / Ed25519KeyIdentity, checks
 *     isDelegationValid + leaf pubkey match, consumes challenge once, then
 *     makes an authenticated IC query as that identity so the replica
 *     verifies the delegation (including II canister signatures). Finally
 *     requires identity.principal === getOwner(siteId).
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { SignIdentity } from "@dfinity/agent";
import {
  DelegationChain,
  DelegationIdentity,
  Ed25519KeyIdentity,
  isDelegationValid,
} from "@dfinity/identity";
import { Principal } from "@dfinity/principal";
import { getEnv } from "./env";
import { getAnonymousSiteActor, getSiteActorWithIdentity } from "./ic";
import { consumeOnce } from "./used-tokens";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_PREFIX = "ice-connect-owner-v1";

export type OwnerChallengePayload = {
  v: 1;
  siteId: string;
  nonce: string;
  exp: number;
};

export type OwnerProofBody = {
  siteId: string;
  /** HMAC-signed challenge token from /api/connect/challenge */
  challenge: string;
  /**
   * Ed25519KeyIdentity.toJSON() for the session (or local) key.
   * For II this is AuthClient's inner session key — never the user's
   * long-term WebAuthn key. Short-lived; treated like a bearer secret.
   */
  sessionIdentity: unknown;
  /** DelegationChain.toJSON() when using Internet Identity */
  delegation?: unknown;
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

function signPayload(payloadB64: string): string {
  const { connectOauthStateSecret } = getEnv();
  return b64url(
    createHmac("sha256", connectOauthStateSecret)
      .update(`${CHALLENGE_PREFIX}:${payloadB64}`)
      .digest(),
  );
}

export function mintOwnerChallenge(siteId: string): string {
  const payload: OwnerChallengePayload = {
    v: 1,
    siteId: siteId.trim(),
    nonce: randomBytes(16).toString("hex"),
    exp: Date.now() + CHALLENGE_TTL_MS,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  return `${payloadB64}.${signPayload(payloadB64)}`;
}

export function parseOwnerChallenge(token: string): OwnerChallengePayload {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid owner challenge format");
  const [payloadB64, sig] = parts;
  const expected = signPayload(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Invalid owner challenge signature");
  }
  const raw = JSON.parse(
    fromB64url(payloadB64).toString("utf8"),
  ) as OwnerChallengePayload;
  if (raw?.v !== 1 || !raw.siteId || !raw.nonce || !raw.exp) {
    throw new Error("Invalid owner challenge payload");
  }
  if (Date.now() > raw.exp) throw new Error("Owner challenge expired");
  return raw;
}

function reconstructIdentity(proof: OwnerProofBody): SignIdentity {
  let session: Ed25519KeyIdentity;
  try {
    session = Ed25519KeyIdentity.fromJSON(
      typeof proof.sessionIdentity === "string"
        ? proof.sessionIdentity
        : JSON.stringify(proof.sessionIdentity),
    );
  } catch {
    throw new Error(
      "Invalid sessionIdentity — use Ed25519 AuthClient session (re-login if needed)",
    );
  }

  if (proof.delegation == null || proof.delegation === "") {
    return session;
  }

  let chain: DelegationChain;
  try {
    chain = DelegationChain.fromJSON(
      typeof proof.delegation === "string"
        ? proof.delegation
        : (proof.delegation as Parameters<typeof DelegationChain.fromJSON>[0]),
    );
  } catch {
    throw new Error("Invalid delegation chain JSON");
  }

  if (!isDelegationValid(chain)) {
    throw new Error("Delegation chain expired or out of scope");
  }

  const leaf = chain.delegations[chain.delegations.length - 1];
  if (!leaf) throw new Error("Empty delegation chain");
  const sessionDer = Buffer.from(session.getPublicKey().toDer());
  const leafDer = Buffer.from(leaf.delegation.pubkey);
  if (
    sessionDer.length !== leafDer.length ||
    !timingSafeEqual(sessionDer, leafDer)
  ) {
    throw new Error("sessionIdentity does not match delegation leaf pubkey");
  }

  return DelegationIdentity.fromDelegation(session, chain);
}

/**
 * Verify owner proof for siteId. Returns the verified owner principal text.
 * Throws on any failure (missing/invalid proof, principal mismatch, bad delegation).
 */
export async function assertOwnerProof(
  proof: OwnerProofBody,
): Promise<{ ownerPrincipal: string; siteId: string }> {
  const siteId = proof.siteId?.trim();
  if (!siteId) throw new Error("siteId is required");
  if (!proof.challenge?.trim()) {
    throw new Error("Owner proof challenge is required");
  }
  if (proof.sessionIdentity == null) {
    throw new Error("Owner proof sessionIdentity is required");
  }

  const challengeToken = proof.challenge.trim();
  const challenge = parseOwnerChallenge(challengeToken);
  if (challenge.siteId !== siteId) {
    throw new Error("Owner challenge siteId mismatch");
  }

  // One-time challenge — blocks replay of a captured proof body.
  const challengeKey = createHash("sha256")
    .update(`owner-challenge:${challengeToken}`)
    .digest("hex");
  if (!consumeOnce(challengeKey, challenge.exp)) {
    throw new Error("Owner challenge already used");
  }

  const identity = reconstructIdentity(proof);
  const caller = identity.getPrincipal();
  if (caller.isAnonymous()) {
    throw new Error("Anonymous identity cannot prove site ownership");
  }

  // Replica verifies II canister signatures on the delegation when this signed
  // query is processed. Forged chains fail here.
  try {
    const authed = await getSiteActorWithIdentity(siteId, identity);
    await authed.getOwner();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Authenticated IC proof call failed (bad or forged delegation): ${msg}`,
    );
  }

  const anon = await getAnonymousSiteActor(siteId);
  const owner = await anon.getOwner();
  if (owner.toText() !== caller.toText()) {
    throw new Error("Authenticated principal does not match site getOwner");
  }

  Principal.fromText(caller.toText());

  return { ownerPrincipal: caller.toText(), siteId };
}
