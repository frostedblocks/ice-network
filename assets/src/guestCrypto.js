/**
 * Client-side encryption for guest secret-link chats.
 * Canister stores only ice1: ciphertext; key material = guest token.
 */

const PREFIX = "ice1:";
const SALT = new TextEncoder().encode("ice-guest-v1");
const INFO = new TextEncoder().encode("msg");

function bytesToBase64Url(bytes) {
  let bin = "";
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(s) {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** High-entropy token: 32 random bytes → base64url (≈43 chars). */
export function generateGuestToken() {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(raw);
}

export function isIceCipher(content) {
  return typeof content === "string" && content.startsWith(PREFIX);
}

async function deriveAesKey(token) {
  // IKM = UTF-8 of the token string (stable across generateGuestToken + server tokens).
  const tokenBytes = new TextEncoder().encode(token);
  const baseKey = await crypto.subtle.importKey("raw", tokenBytes, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: SALT, info: INFO },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * @param {{ name?: string, body: string }} payload
 * @param {string} token
 * @returns {Promise<string>} ice1:… ciphertext
 */
export async function encryptGuestPayload(payload, token) {
  const body = (payload?.body || "").trim();
  if (!body) throw new Error("Empty message");
  const name = (payload?.name || "").trim().slice(0, 80);
  const plain = JSON.stringify({ n: name, b: body });
  const key = await deriveAesKey(token);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain)
  );
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  return PREFIX + bytesToBase64Url(combined);
}

/**
 * @param {string} content
 * @param {string} token
 * @returns {Promise<{ name: string, body: string, encrypted: boolean } | null>}
 */
export async function decryptGuestPayload(content, token) {
  if (!content) return null;
  if (!isIceCipher(content)) {
    // Legacy plaintext — try "Name: body" split
    const idx = content.indexOf(": ");
    if (idx > 0 && idx < 80) {
      return {
        name: content.slice(0, idx),
        body: content.slice(idx + 2),
        encrypted: false,
      };
    }
    return { name: "", body: content, encrypted: false };
  }
  if (!token) return null;
  try {
    const raw = base64UrlToBytes(content.slice(PREFIX.length));
    if (raw.length < 13) return null;
    const iv = raw.slice(0, 12);
    const data = raw.slice(12);
    const key = await deriveAesKey(token);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    const obj = JSON.parse(new TextDecoder().decode(plainBuf));
    return {
      name: typeof obj?.n === "string" ? obj.n : "",
      body: typeof obj?.b === "string" ? obj.b : "",
      encrypted: true,
    };
  } catch {
    return null;
  }
}

/** Display string for a decrypted (or legacy) payload. */
export function formatGuestDisplay(decrypted) {
  if (!decrypted) return "🔒 Encrypted message";
  if (decrypted.name) return `${decrypted.name}: ${decrypted.body}`;
  return decrypted.body || "🔒 Encrypted message";
}
