/**
 * Unwrap Candid `opt T` from the JS agent.
 * May arrive as: [], [value], null/undefined, or (rarely) the bare value.
 */
export function unwrapOpt(val) {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) return val.length > 0 ? val[0] : null;
  return val;
}
