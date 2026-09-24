import React, { useState, useEffect, useCallback } from "react";
import { createUserSiteActor } from "./actors";
import { fetchSiteCycleStatus } from "./canisterControllers";

/** Warning when personal site cycles fall below 2 trillion */
export const SITE_LOW_CYCLES_THRESHOLD = 2_000_000_000_000n; // 2 T

/**
 * User-facing cycle check — same visual language as master CycleBalance.
 * Reads getCyclesGauge when available; falls back to canister_status cycles.
 */
export default function SiteCycleGauge({
  identity,
  siteId,
  ownedSites = [],
  refreshKey = 0,
  busy = false,
  onBalance,
}) {
  const [rows, setRows] = useState(null); // [{ id, label, cycles, hint, source }]
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");

  const toBig = (n) => {
    if (n == null) return 0n;
    if (typeof n === "bigint") return n;
    try {
      return BigInt(n);
    } catch {
      return 0n;
    }
  };

  const formatCycles = (n) => {
    const v = toBig(n);
    if (v === 0n) return "0";
    const T = 1_000_000_000_000n;
    const B = 1_000_000_000n;
    const M = 1_000_000n;
    if (v >= T) {
      const whole = v / T;
      const frac = ((v % T) * 100n) / T;
      return `${whole.toString()}.${frac.toString().padStart(2, "0")} T`;
    }
    if (v >= B) {
      const whole = v / B;
      const frac = ((v % B) * 100n) / B;
      return `${whole.toString()}.${frac.toString().padStart(2, "0")} B`;
    }
    if (v >= M) {
      const whole = v / M;
      const frac = ((v % M) * 100n) / M;
      return `${whole.toString()}.${frac.toString().padStart(2, "0")} M`;
    }
    return v.toLocaleString();
  };

  const isLow = (n) => {
    const v = toBig(n);
    return v > 0n && v < SITE_LOW_CYCLES_THRESHOLD;
  };

  const shortId = (id) => {
    const s = String(id || "");
    if (s.length <= 22) return s;
    return `${s.slice(0, 10)}…${s.slice(-8)}`;
  };

  const readOneSite = async (id) => {
    const idText = typeof id === "string" ? id : id?.toText?.() || String(id);
    let cycles = null;
    let estDays = null;
    let source = "";
    let readHint = "";

    // Prefer site WASM gauge when available
    try {
      const site = await createUserSiteActor(identity, idText);
      if (site.getCyclesGauge) {
        const gauge = await site.getCyclesGauge();
        cycles = gauge?.balance ?? 0;
        estDays =
          gauge?.estimatedDaysLeft != null ? Number(gauge.estimatedDaysLeft) : null;
        source = "gauge";
      }
    } catch (_) {
      /* fall through */
    }

    // Fallback: management canister_status (works on old WASM if you're a controller)
    if (cycles == null) {
      const st = await fetchSiteCycleStatus(identity, idText);
      if (st) {
        cycles = st.cycles;
        source = "status";
        readHint = "Read via canister status";
      }
    }

    if (cycles == null) {
      return {
        id: idText,
        label: "Personal website",
        cycles: 0n,
        hint: "Could not read cycles — sign in as a controller of this canister",
        failed: true,
        estDays: null,
      };
    }

    const low = isLow(cycles);
    const parts = [];
    if (readHint) parts.push(readHint);
    if (low) parts.push("Low — under 2 T");
    if (estDays != null && toBig(cycles) > 0n) parts.push(`~${estDays} days (est.)`);
    if (source === "gauge") parts.push("Live gauge");

    return {
      id: idText,
      label: "Personal website",
      cycles,
      hint: parts.join(" · "),
      failed: false,
      estDays,
      low,
    };
  };

  const load = useCallback(async () => {
    if (!identity) return;
    const ids = [];
    if (Array.isArray(ownedSites) && ownedSites.length) {
      for (const s of ownedSites) ids.push(String(s));
    } else if (siteId) {
      ids.push(String(siteId));
    }
    // Always include active siteId first
    if (siteId) {
      const t = String(siteId);
      const rest = ids.filter((x) => x !== t);
      ids.length = 0;
      ids.push(t, ...rest);
    }
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return;

    setLoading(true);
    setError("");
    try {
      const next = [];
      for (const id of unique.slice(0, 8)) {
        next.push(await readOneSite(id));
      }
      setRows(next);
      const primary = next.find((r) => r.id === String(siteId)) || next[0];
      if (primary && typeof onBalance === "function") {
        onBalance({
          balance: primary.failed ? null : primary.cycles,
          low: !!primary.low,
        });
      }
    } catch (e) {
      console.error(e);
      setError(e?.message || "Could not read site cycle balance.");
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, [identity, siteId, ownedSites, onBalance]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!siteId && !(ownedSites && ownedSites.length)) return null;

  const openNnsTopUp = async (id) => {
    setHint("");
    try {
      await navigator.clipboard?.writeText(id);
      setHint(`Canister ID copied: ${id}`);
    } catch (_) {
      setHint(`Canister ID: ${id} (copy manually)`);
    }
    const nnsUrl = `https://nns.ic0.app/canisters/?u=${encodeURIComponent(id)}`;
    window.open(nnsUrl, "_blank", "noopener,noreferrer");
  };

  const primaryId = siteId ? String(siteId) : rows?.[0]?.id;

  return (
    <div className="ice-panel">
      <div className="ice-panel-head">
        <div>
          <h3 className="ice-panel-title">Canister cycles</h3>
          <p className="ice-panel-desc">
            Personal website balance. Warning below ~2 T — top up via NNS so the site does not freeze.
          </p>
        </div>
        <button
          type="button"
          className="ice-btn"
          disabled={loading || busy}
          onClick={load}
          style={{
            color: "#7dd3fc",
            borderColor: "rgba(56, 189, 248, 0.55)",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "Checking…" : "Check cycles"}
        </button>
      </div>

      {error && (
        <p style={{ color: "#f87171", fontSize: "0.85rem", margin: "0.75rem 0 0 0" }}>{error}</p>
      )}

      {rows != null && !error && (
        <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {rows.some((r) => r.low) && (
            <div
              style={{
                padding: "0.55rem 0.75rem",
                background: "rgba(69, 10, 10, 0.85)",
                border: "1px solid #991b1b",
                borderRadius: "8px",
                color: "#fecaca",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              Low cycles warning — under 2 T. Top up soon so your site does not freeze.
            </div>
          )}

          {rows.map((row) => {
            const low = !!row.low || (!row.failed && isLow(row.cycles));
            const zero = !row.failed && toBig(row.cycles) === 0n;
            const failed = !!row.failed;
            return (
              <div
                key={row.id}
                style={{
                  padding: "0.65rem 0.8rem",
                  background: failed
                    ? "rgba(9, 9, 11, 0.5)"
                    : low
                    ? "rgba(69, 10, 10, 0.75)"
                    : zero
                    ? "rgba(9, 9, 11, 0.5)"
                    : "rgba(5, 46, 22, 0.55)",
                  border: failed
                    ? "1px solid rgba(148, 163, 184, 0.14)"
                    : low
                    ? "1px solid #7f1d1d"
                    : zero
                    ? "1px solid rgba(148, 163, 184, 0.14)"
                    : "1px solid #166534",
                  borderRadius: "8px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontWeight: 600, color: "#e2e8f0", fontSize: "0.9rem" }}>
                    {row.label}
                    {primaryId === row.id && rows.length > 1 ? " (active)" : ""}
                  </div>
                  <div
                    style={{
                      color: failed
                        ? "#94a3b8"
                        : low
                        ? "#fca5a5"
                        : zero
                        ? "#94a3b8"
                        : "#86efac",
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {failed ? "—" : formatCycles(row.cycles)}
                  </div>
                </div>
                <div
                  style={{
                    color: "#64748b",
                    fontSize: "0.7rem",
                    marginTop: "0.3rem",
                    wordBreak: "break-all",
                  }}
                >
                  {row.id}
                  {low && !failed ? " · Low — top up soon" : ""}
                </div>
                {row.hint && (
                  <div
                    style={{
                      color: low ? "#fca5a5" : "#94a3b8",
                      fontSize: "0.72rem",
                      marginTop: "0.25rem",
                    }}
                  >
                    {row.hint}
                  </div>
                )}
                {!failed && (
                  <div style={{ color: "#475569", fontSize: "0.65rem", marginTop: "0.2rem" }}>
                    Exact: {String(toBig(row.cycles))}
                  </div>
                )}
              </div>
            );
          })}

          <div
            style={{
              marginTop: "0.25rem",
              padding: "0.85rem 0.9rem",
              background: "rgba(30, 58, 95, 0.35)",
              border: "1px solid rgba(56, 189, 248, 0.4)",
              borderRadius: "10px",
            }}
          >
            <div style={{ color: "#7dd3fc", fontWeight: 700, fontSize: "0.85rem" }}>
              Top up via NNS
            </div>
            <p
              style={{
                margin: "0.4rem 0 0.65rem",
                color: "#94a3b8",
                fontSize: "0.78rem",
                lineHeight: 1.5,
              }}
            >
              Use NNS with the II that controls this canister. Open the canister, then{" "}
              <strong style={{ color: "#e2e8f0" }}>Add cycles</strong>.
            </p>
            <div
              style={{
                margin: "0 0 0.75rem",
                padding: "0.5rem 0.65rem",
                background: "rgba(120, 53, 15, 0.35)",
                border: "1px solid rgba(251, 191, 36, 0.45)",
                borderRadius: "8px",
                color: "#fde68a",
                fontSize: "0.78rem",
                lineHeight: 1.45,
                fontWeight: 600,
              }}
            >
              Warning: Do not delete controllers or you may lose access.
            </div>
            <ol
              style={{
                margin: "0 0 0.75rem",
                paddingLeft: "1.2rem",
                color: "#64748b",
                fontSize: "0.75rem",
                lineHeight: 1.5,
              }}
            >
              <li>Click below (canister ID is copied)</li>
              <li>Log into NNS with the II that controls this site</li>
              <li>
                Canisters → open{" "}
                <code style={{ color: "#cbd5e1" }}>
                  {primaryId ? shortId(primaryId) : "your site"}
                </code>
              </li>
              <li>Add cycles / top up with ICP</li>
              <li>Return here and press Check cycles</li>
            </ol>
            <button
              type="button"
              disabled={busy || !primaryId}
              onClick={() => openNnsTopUp(primaryId)}
              style={{
                padding: "0.55rem 1rem",
                background: "linear-gradient(135deg, #38bdf8 0%, #818cf8 100%)",
                color: "#0f172a",
                border: "none",
                borderRadius: "8px",
                fontWeight: 700,
                cursor: busy || !primaryId ? "default" : "pointer",
                fontSize: "0.9rem",
              }}
            >
              Open NNS to top up this canister
            </button>
            {hint && (
              <p style={{ margin: "0.5rem 0 0", color: "#4ade80", fontSize: "0.75rem" }}>{hint}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
