import React, { useState, useEffect } from "react";

/**
 * Master-only ban / unban tools.
 */
export default function BanControls({ actor }) {
  const [banPrincipal, setBanPrincipal] = useState("");
  const [bannedList, setBannedList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const loadBanned = async () => {
    if (!actor) return;
    setLoading(true);
    try {
      const list = await actor.getBannedUsers();
      setBannedList(list || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBanned();
  }, [actor]);

  const handleBan = async (e) => {
    e.preventDefault();
    if (!actor || !banPrincipal.trim()) return;

    setBusy(true);
    setMsg("");
    setErr("");

    try {
      const { Principal } = await import("@dfinity/principal");
      const p = Principal.fromText(banPrincipal.trim());
      const result = await actor.adminBanUser(p);
      setMsg(typeof result === "string" ? result : "Banned.");
      setBanPrincipal("");
      await loadBanned();
    } catch (e) {
      console.error(e);
      setErr("Ban failed. Check the Principal ID.");
    } finally {
      setBusy(false);
    }
  };

  const handleUnban = async (p) => {
    if (!actor) return;

    setBusy(true);
    setMsg("");
    setErr("");

    try {
      const result = await actor.adminUnbanUser(p);
      setMsg(typeof result === "string" ? result : "Unbanned.");
      await loadBanned();
    } catch (e) {
      console.error(e);
      setErr("Unban failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <label style={{ display: "block", marginBottom: "0.35rem", fontWeight: 500, color: "#94a3b8", fontSize: "0.9rem" }}>
        Ban / unban user
      </label>
      <p style={{ margin: "0 0 0.6rem 0", fontSize: "0.8rem", color: "#64748b" }}>
        Banned users cannot post, comment, like, love, or report.
      </p>

      <form onSubmit={handleBan} style={{ marginBottom: "0.75rem" }}>
        <input
          type="text"
          value={banPrincipal}
          onChange={(e) => setBanPrincipal(e.target.value)}
          placeholder="Principal ID to ban"
          style={{
            width: "100%",
            padding: "0.55rem 0.7rem",
            background: "rgba(9, 9, 11, 0.72)",
            color: "#e2e8f0",
            border: "1px solid rgba(148, 163, 184, 0.22)",
            borderRadius: "8px",
            fontSize: "0.95rem",
            marginBottom: "0.5rem",
          }}
        />
        <button
          type="submit"
          disabled={busy || !banPrincipal.trim()}
          style={{
            padding: "0.55rem 1rem",
            background: "#7f1d1d",
            color: "#fecaca",
            border: "1px solid #991b1b",
            borderRadius: "8px",
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Working…" : "Ban user"}
        </button>
      </form>

      <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginBottom: "0.4rem" }}>
        Currently banned ({loading ? "…" : bannedList.length})
      </div>

      {!loading && bannedList.length === 0 && (
        <p style={{ color: "#475569", fontSize: "0.85rem" }}>No one is banned.</p>
      )}

      {bannedList.map((p) => (
        <div
          key={p.toString()}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 0.65rem",
            background: "rgba(9, 9, 11, 0.72)",
            border: "1px solid rgba(148, 163, 184, 0.14)",
            borderRadius: "8px",
            marginBottom: "0.4rem",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "0.75rem", color: "#94a3b8", wordBreak: "break-all", flex: 1 }}>
            {p.toString()}
          </span>
          <button
            type="button"
            onClick={() => handleUnban(p)}
            disabled={busy}
            style={{
              padding: "0.3rem 0.65rem",
              background: "#14532d",
              color: "#86efac",
              border: "1px solid #166534",
              borderRadius: "6px",
              cursor: busy ? "default" : "pointer",
              fontSize: "0.8rem",
            }}
          >
            Unban
          </button>
        </div>
      ))}

      {msg && <p style={{ color: "#4ade80", fontSize: "0.85rem" }}>{msg}</p>}
      {err && <p style={{ color: "#f87171", fontSize: "0.85rem" }}>{err}</p>}
    </div>
  );
}
