import React, { useState, useEffect } from "react";
import { invalidateActionFeesCache } from "./useActionFees";

/**
 * Master-only ICP economy:
 * - Join is permanently free (no toggle)
 * - Action fees from prepaid ICP (post / love)
 * - Tipping on/off (II → recipient II)
 */
export default function MasterEconomyControls({ actor }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [postOn, setPostOn] = useState(false);
  const [loveOn, setLoveOn] = useState(false);
  const [msgOn, setMsgOn] = useState(false);
  const [postIcp, setPostIcp] = useState("0");
  const [loveIcp, setLoveIcp] = useState("0");
  const [messageIcp, setMessageIcp] = useState("0");
  const [tippingOn, setTippingOn] = useState(true);

  const e8sToIcp = (e8s) => {
    const n = typeof e8s === "bigint" ? Number(e8s) : Number(e8s);
    if (!Number.isFinite(n)) return "0";
    const icp = n / 100_000_000;
    if (Number.isInteger(icp)) return String(icp);
    return String(icp);
  };

  const icpToE8s = (icp) => {
    const s = String(icp ?? "").trim();
    if (!s) return 0n;
    const parts = s.split(".");
    const whole = BigInt(parts[0] || "0");
    let frac = (parts[1] || "").replace(/\D/g, "").slice(0, 8);
    while (frac.length < 8) frac += "0";
    return whole * 100_000_000n + BigInt(frac || "0");
  };

  const load = async () => {
    if (!actor) return;
    setLoading(true);
    setErr("");
    try {
      const cfg = await actor.getEconomyConfig();
      setPostOn(!!cfg.postFeeEnabled);
      setLoveOn(!!cfg.loveFeeEnabled);
      setMsgOn(!!cfg.messageFeeEnabled);
      setPostIcp(e8sToIcp(cfg.postFeeE8s ?? 0));
      setLoveIcp(e8sToIcp(cfg.loveFeeE8s ?? 0));
      setMessageIcp(e8sToIcp(cfg.messageFeeE8s ?? 0));
      setTippingOn(cfg.tippingEnabled !== false);
    } catch (e) {
      console.error(e);
      setErr("Could not load economy settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [actor]);

  const saveActionFees = async () => {
    if (!actor?.adminSetActionFees) {
      setErr("adminSetActionFees not available — redeploy ICE.");
      return;
    }
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      // No DM fee row — pass the loaded message fee so this save does not clear it.
      const result = await actor.adminSetActionFees(
        postOn,
        icpToE8s(postIcp),
        loveOn,
        icpToE8s(loveIcp),
        msgOn,
        icpToE8s(messageIcp)
      );
      const text = typeof result === "string" ? result : "Saved.";
      if (/not authorized/i.test(text)) setErr(text);
      else {
        invalidateActionFeesCache();
        setMsg(text);
        await load();
      }
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to save action fees.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p style={{ color: "#64748b" }}>Loading economy…</p>;
  }

  const inputStyle = {
    width: "6rem",
    padding: "0.4rem 0.5rem",
    borderRadius: 8,
    border: "1px solid rgba(148,163,184,0.25)",
    background: "rgba(9,9,11,0.7)",
    color: "#e2e8f0",
    fontSize: "0.85rem",
  };

  const feeRow = (label, hint, on, setOn, icp, setIcp) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto auto",
        gap: "0.5rem",
        alignItems: "center",
        marginBottom: "0.55rem",
      }}
    >
      <div>
        <div style={{ color: "#e2e8f0", fontSize: "0.88rem", fontWeight: 600 }}>{label}</div>
        {hint ? (
          <div style={{ color: "#64748b", fontSize: "0.72rem", marginTop: 2 }}>{hint}</div>
        ) : null}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#94a3b8", fontSize: "0.8rem" }}>
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} />
        On
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
        <input value={icp} onChange={(e) => setIcp(e.target.value)} placeholder="0" style={inputStyle} />
        <span style={{ color: "#94a3b8", fontSize: "0.78rem" }}>ICP</span>
      </div>
    </div>
  );

  return (
    <div className="ice-glass-soft" style={{ padding: "1rem", marginTop: "0.75rem" }}>
      <h3 style={{ margin: "0 0 0.35rem", color: "#f8fafc", fontSize: "1rem" }}>ICP economy</h3>
      <p style={{ margin: "0 0 0.85rem", color: "#64748b", fontSize: "0.8rem", lineHeight: 1.45 }}>
        Join / Create account is permanently free. Optional site mint is 10 ICP on Factory. Post and
        love fees (when on) spend prepaid ICP. Tipping can be turned on or off below.
      </p>

      <div style={{ marginBottom: "1.15rem" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#7dd3fc", marginBottom: "0.45rem" }}>
          JOIN
        </div>
        <p style={{ margin: 0, color: "#86efac", fontSize: "0.8rem", lineHeight: 1.4 }}>
          Permanently free — no Join fee toggle. Site mint fee (if any) is charged on Factory only.
        </p>
      </div>

      <div style={{ marginBottom: "1.15rem" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#7dd3fc", marginBottom: "0.45rem" }}>
          ACTION FEES (PREPAID ICP)
        </div>
        <p style={{ margin: "0 0 0.55rem", color: "#64748b", fontSize: "0.75rem", lineHeight: 1.4 }}>
          When off, members see no fee copy for that action. When on, charges come from their prepaid
          ICP balance. Free monthly posts still apply before the post fee.
        </p>
        {feeRow("Post", "After free tier is used up", postOn, setPostOn, postIcp, setPostIcp)}
        {feeRow("Love", null, loveOn, setLoveOn, loveIcp, setLoveIcp)}
        <button
          type="button"
          className="ice-btn-primary"
          disabled={saving}
          onClick={saveActionFees}
          style={{ width: "100%", marginTop: "0.35rem" }}
        >
          {saving ? "Saving…" : "Save action fees"}
        </button>
      </div>

      <div>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#7dd3fc", marginBottom: "0.45rem" }}>
          TIPPING (II → II)
        </div>
        <p style={{ margin: "0 0 0.45rem", color: "#64748b", fontSize: "0.75rem", lineHeight: 1.4 }}>
          Tips go to the recipient’s Internet Identity ledger account — not prepaid balance. When
          tipping is off, members see no tip UI.
        </p>
        <label
          style={{
            display: "flex",
            gap: "0.45rem",
            alignItems: "center",
            color: "#cbd5e1",
            fontSize: "0.85rem",
            marginBottom: "0.55rem",
          }}
        >
          <input
            type="checkbox"
            checked={tippingOn}
            disabled={saving || !actor?.adminSetTippingEnabled}
            onChange={async () => {
              const next = !tippingOn;
              setTippingOn(next);
              setSaving(true);
              setMsg("");
              setErr("");
              try {
                const r = await actor.adminSetTippingEnabled(next);
                setMsg(typeof r === "string" ? r : next ? "Tipping on" : "Tipping off");
                await load();
              } catch (e) {
                setTippingOn(!next);
                setErr(e?.message || "Failed to toggle tipping.");
              } finally {
                setSaving(false);
              }
            }}
          />
          Tipping enabled
        </label>
      </div>

      {msg && <p style={{ color: "#86efac", fontSize: "0.82rem", marginTop: "0.75rem" }}>{msg}</p>}
      {err && <p style={{ color: "#f87171", fontSize: "0.82rem", marginTop: "0.75rem" }}>{err}</p>}
    </div>
  );
}
