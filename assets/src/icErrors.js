/**
 * Clock-skew / certificate-time error detection + one-shot retry for IC calls.
 * Only clock/expiry/certificate-time failures are matched — ordinary replica
 * rejects (e.g. "Not authorized") pass through untouched.
 */

export const CLOCK_SKEW_EVENT = "ice:clock-skew";

const CLOCK_PATTERNS = [
  /certificate is signed more than/i,
  /time offset/i,
  /ingress_expiry/i,
  /specified ingress_expiry not within expected range/i,
  /invalid certificate/i,
  /certificate verification/i,
  /certificate is (?:too old|stale)/i,
];

function errText(err) {
  if (!err) return "";
  try {
    const parts = [err.message, err.name, typeof err === "string" ? err : ""];
    if (err.cause) parts.push(err.cause.message || String(err.cause));
    return parts.filter(Boolean).join(" | ");
  } catch {
    return String(err);
  }
}

export function isClockSkewError(err) {
  const t = errText(err);
  return !!t && CLOCK_PATTERNS.some((re) => re.test(t));
}

/** All agents built by actors.js register here so the banner can re-sync them. */
const knownAgents = new Set();

export function registerAgent(agent) {
  if (agent) knownAgents.add(agent);
  return agent;
}

export async function syncAgentTime(agent) {
  try {
    if (agent && typeof agent.syncTime === "function") await agent.syncTime();
  } catch (e) {
    console.warn("[ICE] agent.syncTime failed", e);
  }
}

export async function syncAllAgents() {
  await Promise.all([...knownAgents].map((a) => syncAgentTime(a)));
}

function announce(err) {
  try {
    window.dispatchEvent(
      new CustomEvent(CLOCK_SKEW_EVENT, { detail: { message: errText(err) } })
    );
  } catch {}
}

/** Run fn; on clock-skew error, sync agent time and retry once. */
export async function withClockRetry(fn, agent) {
  try {
    return await fn();
  } catch (err) {
    if (!isClockSkewError(err)) throw err;
    await syncAgentTime(agent);
    try {
      return await fn();
    } catch (err2) {
      if (isClockSkewError(err2)) announce(err2);
      throw err2;
    }
  }
}

/** Wrap every actor method (query + update) with withClockRetry. */
export function wrapActorWithClockRetry(actor, agent) {
  registerAgent(agent);
  const cache = new Map();
  return new Proxy(actor, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof prop !== "string" || typeof value !== "function") return value;
      if (!cache.has(prop)) {
        cache.set(prop, (...args) =>
          withClockRetry(() => value.apply(target, args), agent)
        );
      }
      return cache.get(prop);
    },
  });
}
