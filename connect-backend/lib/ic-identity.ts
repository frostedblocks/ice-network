import { Ed25519KeyIdentity } from "@dfinity/identity";
import { getIcIdentityMaterial } from "./env";

function decodeSeed(raw: string): Uint8Array {
  const t = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(t)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      out[i] = parseInt(t.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  // base64 / base64url
  const pad = t.length % 4 === 0 ? "" : "=".repeat(4 - (t.length % 4));
  const b64 = t.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const buf = Buffer.from(b64, "base64");
  if (buf.length === 32 || buf.length === 64) {
    return new Uint8Array(buf.subarray(0, 32));
  }
  throw new Error(
    "CONNECT_BACKEND_IC_SEED must be 32-byte hex (64 chars) or base64",
  );
}

/**
 * Minimal PKCS#8 / SEC1 PEM parser for Ed25519 private keys.
 * Accepts:
 *  -----BEGIN PRIVATE KEY----- (PKCS#8)
 *  -----BEGIN ED25519 PRIVATE KEY----- / OPENSSH not supported
 */
function seedFromPem(pem: string): Uint8Array {
  const cleaned = pem
    .replace(/-----BEGIN[^-]+-----/g, "")
    .replace(/-----END[^-]+-----/g, "")
    .replace(/\s+/g, "");
  const der = Buffer.from(cleaned, "base64");

  // PKCS#8 Ed25519: look for 0x04 0x20 <32-byte seed>
  for (let i = 0; i < der.length - 33; i++) {
    if (der[i] === 0x04 && der[i + 1] === 0x20) {
      return new Uint8Array(der.subarray(i + 2, i + 34));
    }
  }
  // Raw 32-byte after a short header
  if (der.length >= 32 && der.length <= 64) {
    return new Uint8Array(der.subarray(der.length - 32));
  }
  throw new Error("Could not parse Ed25519 seed from CONNECT_BACKEND_IC_IDENTITY_PEM");
}

let cached: Ed25519KeyIdentity | null = null;

export function getBackendIdentity(): Ed25519KeyIdentity {
  if (cached) return cached;
  const { pem, seed } = getIcIdentityMaterial();
  const secret = pem ? seedFromPem(pem) : decodeSeed(seed!);
  cached = Ed25519KeyIdentity.fromSecretKey(secret);
  return cached;
}

export function getBackendPrincipalText(): string {
  return getBackendIdentity().getPrincipal().toText();
}
