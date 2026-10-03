/**
 * Master gate for Store / Connect commerce UI.
 * Default OFF until master enables after LLC + seller payouts.
 * Reads ice.isStoreCommerceEnabled(); if method missing, stays off.
 */

let cached = null;
let inflight = null;

export function getCachedStoreCommerceEnabled() {
  return cached === true;
}

export function invalidateStoreCommerceCache() {
  cached = null;
  inflight = null;
}

/**
 * @param {object|null|undefined} actor ice actor
 * @returns {Promise<boolean>}
 */
export async function fetchStoreCommerceEnabled(actor) {
  if (!actor) {
    cached = false;
    return false;
  }
  if (typeof actor.isStoreCommerceEnabled !== "function") {
    cached = false;
    return false;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const v = await actor.isStoreCommerceEnabled();
      cached = !!v;
      return cached;
    } catch (e) {
      console.warn("isStoreCommerceEnabled failed — treating as off", e);
      cached = false;
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
