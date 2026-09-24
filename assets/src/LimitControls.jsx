import React, { useState, useEffect } from "react";

/**
 * Master-only: free posts, daily caps, character limits, report threshold.
 * Legacy soft-token cost fields are no longer shown — action fees are ICP in Economy.
 */
export default function LimitControls({ actor }) {
  const [form, setForm] = useState({
    freeTierLimit: "20",
    dailyLimit: "5",
    freeMaxLength: "115",
    paidMaxLength: "512",
    maxCommentLength: "2000",
    reportsToHide: "5",
  });
  // Keep legacy token args for adminSetLimits candid shape (unused by spend path).
  const [legacyTokenArgs, setLegacyTokenArgs] = useState({
    tokensPerPost: 0,
    tokensPerLove: 0,
    tokensPerMessage: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    if (!actor) return;
    setLoading(true);
    try {
      const limits = await actor.getLimits();
      setForm({
        freeTierLimit: String(Number(limits.freeTierLimit)),
        dailyLimit: String(Number(limits.dailyLimit)),
        freeMaxLength: String(Number(limits.freeMaxLength)),
        paidMaxLength: String(Number(limits.paidMaxLength)),
        maxCommentLength: String(Number(limits.maxCommentLength)),
        reportsToHide: String(Number(limits.reportsToHide)),
      });
      setLegacyTokenArgs({
        tokensPerPost: Number(limits.tokensPerPost) || 0,
        tokensPerLove: Number(limits.tokensPerLove) || 0,
        tokensPerMessage: Number(limits.tokensPerMessage) || 0,
      });
    } catch (e) {
      console.error(e);
      setErr("Could not load limits.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [actor]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!actor) return;

    setSaving(true);
    setMsg("");
    setErr("");

    try {
      const result = await actor.adminSetLimits(
        Number(form.freeTierLimit) || 0,
        Number(form.dailyLimit) || 0,
        legacyTokenArgs.tokensPerPost || 0,
        legacyTokenArgs.tokensPerLove || 0,
        legacyTokenArgs.tokensPerMessage || 0,
        Number(form.freeMaxLength) || 1,
        Number(form.paidMaxLength) || 1,
        Number(form.maxCommentLength) || 1,
        Number(form.reportsToHide) || 1
      );
      setMsg(typeof result === "string" ? result : "Limits updated.");
      await load();
    } catch (e) {
      console.error(e);
      setErr("Failed to save limits.");
    } finally {
      setSaving(false);
    }
  };

  const fields = [
    { key: "freeTierLimit", label: "Free posts per month" },
    { key: "dailyLimit", label: "Posts per day (all users)" },
    { key: "freeMaxLength", label: "Free tier max characters" },
    { key: "paidMaxLength", label: "Paid / unlocked max characters" },
    { key: "maxCommentLength", label: "Max comment characters" },
    { key: "reportsToHide", label: "Reports needed to auto-hide" },
  ];

  return (
    <div className="ice-glass-soft" style={{ padding: "1rem", marginTop: "0.75rem", marginBottom: "0.5rem" }}>
      <h3 style={{ margin: "0 0 0.35rem", color: "#f8fafc", fontSize: "1rem" }}>Limits</h3>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", color: "#64748b", lineHeight: 1.45 }}>
        Post allowances and character caps. Action prices are set under ICP economy (prepaid ICP), not
        here.
      </p>

      {loading ? (
        <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Loading…</p>
      ) : (
        <form onSubmit={handleSave}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "0.65rem",
              marginBottom: "0.85rem",
            }}
          >
            {fields.map((f) => (
              <div key={f.key}>
                <label style={{ display: "block", fontSize: "0.75rem", color: "#64748b", marginBottom: "0.25rem" }}>
                  {f.label}
                </label>
                <input
                  type="number"
                  min="0"
                  value={form[f.key]}
                  onChange={(e) => setField(f.key, e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.45rem 0.55rem",
                    background: "rgba(9, 9, 11, 0.72)",
                    color: "#e2e8f0",
                    border: "1px solid rgba(148, 163, 184, 0.22)",
                    borderRadius: "8px",
                    fontSize: "0.9rem",
                  }}
                />
              </div>
            ))}
          </div>

          <button type="submit" className="ice-btn-primary" disabled={saving}>
            {saving ? "Saving…" : "Save limits"}
          </button>
        </form>
      )}

      {msg && <p style={{ color: "#4ade80", fontSize: "0.85rem", marginTop: "0.6rem" }}>{msg}</p>}
      {err && <p style={{ color: "#f87171", fontSize: "0.85rem", marginTop: "0.6rem" }}>{err}</p>}
    </div>
  );
}
