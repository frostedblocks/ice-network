import { useState, useEffect } from "react";

/** Format e8s → short ICP label for UI. */
export function formatIcpFromE8s(e8s) {
  const n = typeof e8s === "bigint" ? Number(e8s) : Number(e8s ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  const icp = n / 100_000_000;
  if (Number.isInteger(icp)) return String(icp);
  return icp.toFixed(4).replace(/\.?0+$/, "");
}

/**
 * Normalize getEconomyConfig() into action-fee flags members can use.
 * Fees are off by default — never invent amounts when disabled.
 */
export function parseActionFees(cfg) {
  if (!cfg) {
    return {
      postFeeEnabled: false,
      loveFeeEnabled: false,
      messageFeeEnabled: false,
      postFeeE8s: 0,
      loveFeeE8s: 0,
      messageFeeE8s: 0,
      anyActionFeeOn: false,
    };
  }
  const postFeeE8s = Number(cfg.postFeeE8s ?? 0);
  const loveFeeE8s = Number(cfg.loveFeeE8s ?? 0);
  const messageFeeE8s = Number(cfg.messageFeeE8s ?? 0);
  const postFeeEnabled = !!cfg.postFeeEnabled && postFeeE8s > 0;
  const loveFeeEnabled = !!cfg.loveFeeEnabled && loveFeeE8s > 0;
  const messageFeeEnabled = !!cfg.messageFeeEnabled && messageFeeE8s > 0;
  return {
    postFeeEnabled,
    loveFeeEnabled,
    messageFeeEnabled,
    postFeeE8s,
    loveFeeE8s,
    messageFeeE8s,
    anyActionFeeOn: postFeeEnabled || loveFeeEnabled || messageFeeEnabled,
  };
}

const DEFAULT = parseActionFees(null);

/** Shared cache so many PostCards don't each call getEconomyConfig. */
let cache = { actor: null, fees: DEFAULT, promise: null, at: 0 };
const CACHE_MS = 30_000;

export async function loadActionFees(actor) {
  if (!actor?.getEconomyConfig) return DEFAULT;
  const now = Date.now();
  if (cache.actor === actor && cache.promise && now - cache.at < CACHE_MS) {
    return cache.promise;
  }
  if (cache.actor === actor && now - cache.at < CACHE_MS) {
    return cache.fees;
  }
  cache.actor = actor;
  cache.at = now;
  cache.promise = actor
    .getEconomyConfig()
    .then((cfg) => {
      cache.fees = parseActionFees(cfg);
      cache.promise = null;
      return cache.fees;
    })
    .catch((e) => {
      console.error(e);
      cache.promise = null;
      cache.fees = DEFAULT;
      return DEFAULT;
    });
  return cache.promise;
}

/** Clear cache after master saves fee settings (optional). */
export function invalidateActionFeesCache() {
  cache = { actor: null, fees: DEFAULT, promise: null, at: 0 };
}

/**
 * Load post / love / message fee toggles from ICE.
 * Member UI should mention those fees only when the matching flag is on.
 */
export default function useActionFees(actor) {
  const [fees, setFees] = useState(() =>
    cache.actor === actor ? cache.fees : DEFAULT
  );
  const [loading, setLoading] = useState(!!actor);

  useEffect(() => {
    let cancelled = false;
    if (!actor?.getEconomyConfig) {
      setFees(DEFAULT);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    loadActionFees(actor).then((next) => {
      if (!cancelled) {
        setFees(next);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [actor]);

  return { ...fees, loading };
}
