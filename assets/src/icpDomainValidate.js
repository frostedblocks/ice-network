/**
 * ICP custom-domain boundary validation (icp0.io).
 * Used before confirmSiteDns and before detach so detach-ready requires live DNS.
 */

export function normalizeDomainHost(input) {
  if (!input || typeof input !== "string") return "";
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    .replace(/\.$/, "");
}

/**
 * @param {string} domain hostname or URL
 * @returns {Promise<{ ok: boolean, status: number, body: string, domain: string }>}
 */
export async function validateDomainWithIcp(domain) {
  const d = normalizeDomainHost(domain);
  if (!d) {
    return { ok: false, status: 0, body: "Empty domain", domain: "" };
  }
  const res = await fetch(
    `https://icp0.io/custom-domains/v1/${encodeURIComponent(d)}/validate`
  );
  const body = await res.text();
  return { ok: res.ok, status: res.status, body, domain: d };
}

/** Production = mainnet agent host (DFX_NETWORK=ic). Default true when unset on live builds. */
export function isProductionNetwork() {
  const n =
    import.meta.env.DFX_NETWORK ||
    import.meta.env.VITE_DFX_NETWORK ||
    "ic";
  return n === "ic";
}
