import React, { useCallback, useEffect, useState } from "react";
import AdminLite from "./AdminLite";

/**
 * Master Profile only — one-time Activate binds Lite admin writes to this II,
 * then shows Lite ICE controls. Does not change ICE Network economy/tabs.
 */
export default function MasterLiteActivate({ actor, identity }) {
  const [claimed, setClaimed] = useState(null);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [showPanel, setShowPanel] = useState(false);
  const [registeredUsers, setRegisteredUsers] = useState(null);

  const loadLiteStats = useCallback(async () => {
    try {
      const res = await fetch("https://lite.frostedblocks.com/api/stats", {
        method: "GET",
        credentials: "omit",
      });
      if (!res.ok) {
        setRegisteredUsers(null);
        return;
      }
      const data = await res.json();
      setRegisteredUsers(
        data.registeredUsers == null ? null : Number(data.registeredUsers)
      );
    } catch (e) {
      console.error(e);
      setRegisteredUsers(null);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!actor) return;
    try {
      const [c, m] = await Promise.all([
        actor.isLiteAdminClaimed ? actor.isLiteAdminClaimed() : Promise.resolve(false),
        actor.canManageLiteAdmin ? actor.canManageLiteAdmin() : Promise.resolve(false),
      ]);
      setClaimed(!!c);
      setCanManage(!!m);
      if (m) setShowPanel(true);
      await loadLiteStats();
    } catch (e) {
      console.error(e);
      setErr("Could not load Lite admin status.");
    }
  }, [actor, loadLiteStats]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const activate = async () => {
    if (!actor?.claimLiteAdmin) {
      setErr("claimLiteAdmin missing — redeploy ICE.");
      return;
    }
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const text = await actor.claimLiteAdmin();
      const s = typeof text === "string" ? text : "Done.";
      if (/not authorized|already activated by another/i.test(s)) {
        setErr(s);
      } else {
        setMsg(s);
        await refresh();
        setShowPanel(true);
      }
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Activate failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="ice-glass-soft"
      style={{
        padding: "1rem",
        marginBottom: "1rem",
        border: "1px solid rgba(167, 139, 250, 0.35)",
      }}
    >
      <div
        style={{
          fontSize: "0.72rem",
          fontWeight: 700,
          color: "#c4b5fd",
          marginBottom: "0.35rem",
          letterSpacing: "0.04em",
        }}
      >
        LITE ICE CONTROLS
      </div>
      <p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", color: "#94a3b8", lineHeight: 1.45 }}>
        Separate from ICE Network tools below. Manages accounts/activity on{" "}
        <strong style={{ color: "#e2e8f0" }}>lite.frostedblocks.com</strong> only. One-time activate
        locks writes to <em>this</em> Internet Identity.
      </p>

      <div
        style={{
          marginBottom: "0.85rem",
          padding: "0.65rem 0.75rem",
          borderRadius: 10,
          background: "rgba(0,0,0,0.28)",
          border: "1px solid rgba(148,163,184,0.18)",
        }}
      >
        {registeredUsers != null ? (
          <div style={{ fontSize: "1.25rem", fontWeight: 800, color: "#f8fafc" }}>
            {registeredUsers.toLocaleString()}
            <span style={{ fontSize: "0.8rem", fontWeight: 500, color: "#94a3b8", marginLeft: "0.4rem" }}>
              registered on Lite
            </span>
          </div>
        ) : (
          <div style={{ fontSize: "0.82rem", color: "#64748b" }}>Loading Lite registrations…</div>
        )}
      </div>

      {canManage ? (
        <>
          <button
            type="button"
            className="ice-btn-primary"
            onClick={() => setShowPanel((v) => !v)}
            style={{ marginBottom: showPanel ? "0.85rem" : 0 }}
          >
            {showPanel ? "Hide Lite controls" : "Show Lite controls"}
          </button>
          {showPanel && (
            <AdminLite actor={actor} identity={identity} onBack={() => setShowPanel(false)} />
          )}
        </>
      ) : claimed === false ? (
        <button type="button" className="ice-btn-primary" disabled={busy} onClick={activate}>
          {busy ? "Activating…" : "Activate Lite ICE controls (one time)"}
        </button>
      ) : claimed === true ? (
        <p style={{ margin: 0, fontSize: "0.85rem", color: "#fde68a" }}>
          Lite admin was already activated on another Internet Identity. Sign in with that II, or use
          the II that claimed it.
        </p>
      ) : (
        <p style={{ margin: 0, color: "#64748b", fontSize: "0.85rem" }}>Loading…</p>
      )}

      {msg && <p style={{ color: "#86efac", fontSize: "0.82rem", marginTop: "0.65rem" }}>{msg}</p>}
      {err && <p style={{ color: "#f87171", fontSize: "0.82rem", marginTop: "0.65rem" }}>{err}</p>}
    </div>
  );
}
