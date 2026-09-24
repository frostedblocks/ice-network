import React, { useState } from "react";
import { createFactoryActor } from "./actors";

/**
 * Master-only: cycle balances for ice, messaging, assets, and factory mint capacity.
 */
export default function CycleBalance({ actor, identity }) {
  const [balances, setBalances] = useState(null); // { ice, messaging, assets, factory, factoryMsg, canMint }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  const isLow = (n) => toBig(n) > 0n && toBig(n) < 500_000_000_000n;
  /** Factory needs ~1.1T to mint a site */
  const isFactoryLow = (n) => toBig(n) < 1_100_000_000_000n;

  const load = async () => {
    if (!actor) return;
    setLoading(true);
    setError("");
    try {
      if (!actor.getCanisterCycles) {
        setError("Cycles method not available — redeploy frontend IDL.");
        setBalances(null);
        return;
      }
      const bal = await actor.getCanisterCycles();
      let next = {
        ice: 0,
        messaging: 0,
        assets: 0,
        factory: 0,
        factoryMsg: "",
        canMint: true,
        registry: null,
        registryLow: false,
        registryMsg: "",
      };
      if (bal != null && typeof bal === "object" && ("ice" in bal || "messaging" in bal)) {
        next.ice = bal.ice ?? 0;
        next.messaging = bal.messaging ?? 0;
        next.assets = bal.assets ?? 0;
      } else {
        next.ice = bal ?? 0;
      }

      if (identity) {
        try {
          const factory = await createFactoryActor(identity);
          if (factory.getNetworkCyclesHealth) {
            const h = await factory.getNetworkCyclesHealth();
            next.factory = h.factoryCycles ?? 0;
            next.canMint = !!h.factoryCanMint;
            next.factoryMsg = h.message || "";
            const rc = h.registryCycles;
            if (Array.isArray(rc) && rc.length) {
              next.registry = rc[0];
              next.registryLow = !!h.registryLow;
              next.registryMsg = h.registryLow
                ? "Registry low — top up tihtb-… soon"
                : "Registry cycles OK";
            } else if (rc != null && typeof rc === "object" && "Some" in (rc || {})) {
              /* candid optional variants */
            } else if (rc !== null && rc !== undefined && !Array.isArray(rc)) {
              next.registry = rc;
              next.registryLow = !!h.registryLow;
              next.registryMsg = h.registryLow
                ? "Registry low — top up soon"
                : "Registry cycles OK";
            } else if (h.registryLow) {
              next.registryLow = true;
              next.registryMsg = "Registry unreadable or low";
            }
          } else if (factory.getProvisionCapacity) {
            const cap = await factory.getProvisionCapacity();
            next.factory = cap.factoryCycles ?? 0;
            next.factoryMsg = cap.message || "";
            next.canMint = !!cap.canMint;
          } else if (factory.getFactoryCycles) {
            next.factory = await factory.getFactoryCycles();
            next.canMint = !isFactoryLow(next.factory);
            next.factoryMsg = next.canMint
              ? "Factory cycles OK"
              : "Factory cycles low — Join cannot mint sites";
          }
        } catch (fe) {
          console.warn(fe);
          next.factoryMsg = "Could not read factory cycles";
        }
      }

      setBalances(next);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Could not read cycle balances.");
      setBalances(null);
    } finally {
      setLoading(false);
    }
  };

  const rows = balances
    ? [
        {
          key: "factory",
          label: "Factory (site mint)",
          id: "xfwx3-7yaaa-aaaas-qgxpq-cai",
          cycles: balances.factory,
          lowOverride: isFactoryLow(balances.factory) || balances.canMint === false,
          hint: balances.factoryMsg,
        },
        ...(balances.registry != null || balances.registryLow
          ? [
              {
                key: "registry",
                label: "Registry (mint log)",
                id: "tihtb-myaaa-aaaas-qgxvq-cai",
                cycles: balances.registry ?? 0,
                lowOverride: !!balances.registryLow,
                hint: balances.registryMsg || "",
              },
            ]
          : []),
        {
          key: "ice",
          label: "Ice (backend)",
          id: "6jf55-2qaaa-aaaan-q6mwq-cai",
          cycles: balances.ice,
        },
        {
          key: "assets",
          label: "Assets (website)",
          id: "6hhqv-baaaa-aaaan-q6mxq-cai",
          cycles: balances.assets,
        },
      ]
    : [];

  return (
    <div
      className="ice-glass-soft"
      style={{
        marginBottom: "1.5rem",
        padding: "0.9rem 1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ color: "#e2e8f0", fontWeight: 500 }}>Canister cycles</div>
          <div style={{ color: "#64748b", fontSize: "0.8rem", marginTop: "0.2rem" }}>
            Factory must stay above ~1.1 T to mint personal sites after Join.
          </div>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={load}
          style={{
            padding: "0.45rem 0.9rem",
            background: "rgba(30, 58, 95, 0.65)",
            color: "#7dd3fc",
            border: "1px solid #38bdf8",
            borderRadius: "8px",
            fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? "Checking…" : "Check cycles"}
        </button>
      </div>

      {error && (
        <p style={{ color: "#f87171", fontSize: "0.85rem", margin: "0.75rem 0 0 0" }}>{error}</p>
      )}

      {balances != null && !error && (
        <div style={{ marginTop: "0.75rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {rows.map((row) => {
            const low = row.lowOverride != null ? row.lowOverride : isLow(row.cycles);
            const zero = toBig(row.cycles) === 0n;
            return (
              <div
                key={row.key}
                style={{
                  padding: "0.65rem 0.8rem",
                  background: low ? "rgba(69, 10, 10, 0.75)" : zero ? "rgba(9, 9, 11, 0.5)" : "rgba(5, 46, 22, 0.55)",
                  border: low
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
                  <div style={{ fontWeight: 600, color: "#e2e8f0", fontSize: "0.9rem" }}>{row.label}</div>
                  <div
                    style={{
                      color: low ? "#fca5a5" : zero ? "#94a3b8" : "#86efac",
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {formatCycles(row.cycles)}
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
                  {low && " · Low — top up soon"}
                  {zero && !low && " · 0 or unavailable (needs ice as controller)"}
                </div>
                {row.hint && (
                  <div style={{ color: low ? "#fca5a5" : "#94a3b8", fontSize: "0.72rem", marginTop: "0.25rem" }}>
                    {row.hint}
                  </div>
                )}
                <div style={{ color: "#475569", fontSize: "0.65rem", marginTop: "0.2rem" }}>
                  Exact: {String(toBig(row.cycles))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
