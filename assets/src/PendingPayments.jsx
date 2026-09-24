import React, { useState, useEffect } from "react";

/**
 * Master-only: confirm or reject pending token-pack purchase requests.
 */
export default function PendingPayments({ actor }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const e8sToIcp = (e8s) => (Number(e8s) / 100_000_000).toFixed(4);

  const load = async () => {
    if (!actor?.getPendingPayments) return;
    setLoading(true);
    setErr("");
    try {
      const list = await actor.getPendingPayments();
      // [(id, PendingPayment)] 
      const rows = (list || []).map((entry) => {
        if (Array.isArray(entry)) {
          return { id: entry[0], ...entry[1] };
        }
        return entry;
      });
      setItems(rows);
    } catch (e) {
      console.error(e);
      setErr("Could not load pending payments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [actor]);

  const confirm = async (id) => {
    setBusy(String(id));
    setMsg("");
    setErr("");
    try {
      const result = await actor.adminConfirmPayment(id);
      setMsg(typeof result === "string" ? result : "Confirmed.");
      await load();
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Confirm failed.");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (id) => {
    setBusy(String(id));
    setMsg("");
    setErr("");
    try {
      const result = await actor.adminRejectPayment(id);
      setMsg(typeof result === "string" ? result : "Rejected.");
      await load();
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Reject failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="ice-glass-soft"
      style={{
        marginBottom: "1.5rem",
        padding: "0.9rem 1rem",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
        <div style={{ color: "#e2e8f0", fontWeight: 500 }}>Pending token purchases</div>
        <button
          type="button"
          onClick={load}
          style={{
            fontSize: "0.8rem",
            padding: "0.25rem 0.6rem",
            background: "rgba(148, 163, 184, 0.14)",
            color: "#94a3b8",
            border: "1px solid rgba(148, 163, 184, 0.22)",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>
      <p style={{ color: "#64748b", fontSize: "0.8rem", margin: "0 0 0.75rem 0" }}>
        Legacy manual requests only. Normal users now pay automatically (Buy with ICP) — no confirm needed.
        Only press Confirm if you verified real ICP was received outside the app.
      </p>

      {loading && <p style={{ color: "#64748b", fontSize: "0.85rem" }}>Loading…</p>}
      {!loading && items.length === 0 && (
        <p style={{ color: "#475569", fontSize: "0.85rem", margin: 0 }}>No pending requests.</p>
      )}

      {items.map((p) => (
        <div
          key={String(p.id)}
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.5rem",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.6rem 0",
            borderTop: "1px solid rgba(148, 163, 184, 0.14)",
          }}
        >
          <div style={{ fontSize: "0.85rem", color: "#94a3b8", minWidth: "200px" }}>
            <div>
              <strong style={{ color: "#e2e8f0" }}>#{String(p.id)}</strong> · {Number(p.tokens)} tokens ·{" "}
              <span style={{ color: "#fbbf24" }}>{e8sToIcp(p.priceE8s)} ICP</span>
            </div>
            <div style={{ fontSize: "0.75rem", wordBreak: "break-all", marginTop: "0.2rem" }}>
              {p.user?.toString?.() || String(p.user)}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            <button
              type="button"
              disabled={busy === String(p.id)}
              onClick={() => confirm(p.id)}
              style={{
                padding: "0.35rem 0.7rem",
                background: "#14532d",
                color: "#86efac",
                border: "1px solid #22c55e",
                borderRadius: "6px",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.8rem",
              }}
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={busy === String(p.id)}
              onClick={() => reject(p.id)}
              style={{
                padding: "0.35rem 0.7rem",
                background: "#450a0a",
                color: "#fca5a5",
                border: "1px solid #7f1d1d",
                borderRadius: "6px",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "0.8rem",
              }}
            >
              Reject
            </button>
          </div>
        </div>
      ))}

      {msg && <p style={{ color: "#4ade80", fontSize: "0.85rem", margin: "0.5rem 0 0 0" }}>{msg}</p>}
      {err && <p style={{ color: "#f87171", fontSize: "0.85rem", margin: "0.5rem 0 0 0" }}>{err}</p>}
    </div>
  );
}
