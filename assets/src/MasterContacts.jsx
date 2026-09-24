import React, { useCallback, useEffect, useState } from "react";

/**
 * Master-only inbox for public pre-login contact messages.
 */
export default function MasterContacts({ actor, enabled }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!actor || !enabled) return;
    if (typeof actor.getMasterContacts !== "function") return;
    setLoading(true);
    setErr("");
    try {
      const [list, count] = await Promise.all([
        actor.getMasterContacts(50n),
        actor.getUnreadMasterContactCount
          ? actor.getUnreadMasterContactCount()
          : Promise.resolve(0),
      ]);
      setItems(Array.isArray(list) ? list : []);
      setUnread(typeof count === "bigint" ? Number(count) : Number(count) || 0);
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Could not load contacts");
    } finally {
      setLoading(false);
    }
  }, [actor, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const markAll = async () => {
    if (!actor?.markAllMasterContactsRead) return;
    setBusy(true);
    try {
      await actor.markAllMasterContactsRead();
      await load();
    } catch (e) {
      setErr(e?.message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  const wipeAll = async () => {
    if (!actor?.wipeAllMasterContacts) {
      setErr("Wipe is not available on this build yet.");
      return;
    }
    if (!window.confirm("Permanently delete ALL legacy contact notes?")) return;
    setBusy(true);
    setErr("");
    try {
      const msg = await actor.wipeAllMasterContacts();
      setItems([]);
      setUnread(0);
      if (typeof msg === "string") setErr(""); // clear; success via empty list
      await load();
    } catch (e) {
      setErr(e?.message || "Wipe failed");
    } finally {
      setBusy(false);
    }
  };

  const markOne = async (id) => {
    if (!actor?.markMasterContactRead) return;
    try {
      await actor.markMasterContactRead(typeof id === "bigint" ? id : BigInt(id));
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  if (!enabled) return null;

  const formatWhen = (ts) => {
    try {
      const ms = Number(typeof ts === "bigint" ? ts : ts) / 1e6;
      if (!Number.isFinite(ms) || ms <= 0) return "";
      return new Date(ms).toLocaleString();
    } catch {
      return "";
    }
  };

  return (
    <div className="ice-profile-card" style={{ marginBottom: "1rem" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "0.75rem",
        }}
      >
        <div>
          <div className="ice-section-title" style={{ margin: 0 }}>
            Legacy contact notes
          </div>
          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "0.2rem" }}>
            Old one-way notes (no reply). Use Messages → Public inbox for live guest chats
            {unread > 0 ? ` · ${unread} unread` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button type="button" className="ice-btn ice-btn-xs" disabled={busy || loading} onClick={load}>
            Refresh
          </button>
          <button
            type="button"
            className="ice-btn ice-btn-xs"
            disabled={busy || unread === 0}
            onClick={markAll}
          >
            Mark all read
          </button>
          <button
            type="button"
            className="ice-btn ice-btn-xs"
            disabled={busy || items.length === 0}
            onClick={wipeAll}
            style={{ borderColor: "rgba(248,113,113,0.45)", color: "#fecaca" }}
          >
            Delete all
          </button>
        </div>
      </div>

      {err && <p style={{ color: "#f87171", fontSize: "0.8rem" }}>{err}</p>}
      {loading && items.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "0.85rem" }}>Loading…</p>
      ) : items.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "0.85rem", margin: 0 }}>No messages yet.</p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((c) => {
            const id = c.id;
            const key = typeof id === "bigint" ? id.toString() : String(id);
            const who =
              (c.fromLabel && String(c.fromLabel).trim()) ||
              (c.from?.toText ? c.from.toText() : String(c.from || "Guest"));
            return (
              <li
                key={key}
                onClick={() => {
                  if (!c.read) markOne(id);
                }}
                style={{
                  padding: "0.75rem 0.85rem",
                  marginBottom: "0.45rem",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.14)",
                  background: c.read ? "rgba(9,9,11,0.35)" : "rgba(125,211,252,0.08)",
                  cursor: c.read ? "default" : "pointer",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    marginBottom: "0.35rem",
                  }}
                >
                  <strong style={{ color: "#e2e8f0", fontSize: "0.85rem" }}>{who}</strong>
                  <span style={{ color: "#64748b", fontSize: "0.7rem" }}>
                    {formatWhen(c.createdAt)}
                    {!c.read ? " · unread" : ""}
                  </span>
                </div>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem", lineHeight: 1.45 }}>
                  {c.content}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
