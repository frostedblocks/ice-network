import React, { useCallback, useEffect, useState } from "react";

/**
 * Hidden ICE Network route: /admin/lite (hash #/admin/lite).
 * Owner II only (canManageLiteAdmin). No nav link. Not on Profile.
 */
export default function AdminLite({ actor, identity, onBack }) {
  const [allowed, setAllowed] = useState(null); // null=loading, false=denied, true=ok
  const [admin, setAdmin] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [handle, setHandle] = useState("");
  const [postId, setPostId] = useState("");
  const [liteStats, setLiteStats] = useState(null); // { registeredUsers, posts } | null

  const loadLiteStats = useCallback(async () => {
    try {
      const res = await fetch("https://lite.frostedblocks.com/api/stats", {
        method: "GET",
        credentials: "omit",
      });
      if (!res.ok) {
        setLiteStats(null);
        return;
      }
      const data = await res.json();
      setLiteStats({
        registeredUsers:
          data.registeredUsers == null ? null : Number(data.registeredUsers),
        posts: data.posts == null ? null : Number(data.posts),
      });
    } catch (e) {
      console.error(e);
      setLiteStats(null);
    }
  }, []);

  const load = useCallback(async () => {
    if (!actor?.getLiteAdmin || !actor?.canManageLiteAdmin) {
      setAllowed(false);
      setErr("Lite admin API missing — redeploy ICE.");
      return;
    }
    try {
      const ok = !!(await actor.canManageLiteAdmin());
      setAllowed(ok);
      if (!ok) return;
      const st = await actor.getLiteAdmin();
      setAdmin({
        signupsOpen: !!st.signupsOpen,
        feedBridgeOpen: !!st.feedBridgeOpen,
        bannedLiteHandles: [...(st.bannedLiteHandles || [])],
        hiddenLitePostIds: [...(st.hiddenLitePostIds || [])],
        updatedAt: Number(st.updatedAt || 0),
      });
      await loadLiteStats();
    } catch (e) {
      console.error(e);
      setAllowed(false);
      setErr("Could not load Lite admin.");
    }
  }, [actor, loadLiteStats]);

  useEffect(() => {
    load();
  }, [load]);

  const applyWrite = async (fn) => {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const result = await fn();
      if (result && "unauthorized" in result) {
        setErr("Unauthorized.");
        setAllowed(false);
        return;
      }
      const ok = result?.ok || result;
      if (ok) {
        setAdmin({
          signupsOpen: !!ok.signupsOpen,
          feedBridgeOpen: !!ok.feedBridgeOpen,
          bannedLiteHandles: [...(ok.bannedLiteHandles || [])],
          hiddenLitePostIds: [...(ok.hiddenLitePostIds || [])],
          updatedAt: Number(ok.updatedAt || 0),
        });
        setMsg("Saved.");
      } else {
        setErr("Write failed.");
      }
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Write failed.");
    } finally {
      setBusy(false);
    }
  };

  if (allowed === null) {
    return (
      <div style={{ padding: "2rem", color: "#64748b" }}>Loading…</div>
    );
  }

  if (!allowed || !identity) {
    const me = identity?.getPrincipal?.()?.toText?.() || "";
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    const onApex = host === "frostedblocks.com";
    return (
      <div style={{ padding: "2rem", color: "#94a3b8", maxWidth: 520 }}>
        <p style={{ color: "#e2e8f0", fontWeight: 700, marginTop: 0 }}>No access.</p>
        <p style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>
          Lite admin only works for one Internet Identity. Your current login does not match.
        </p>
        {me ? (
          <p style={{ fontSize: "0.8rem", wordBreak: "break-all", color: "#64748b" }}>
            Signed in as: <code style={{ color: "#94a3b8" }}>{me}</code>
          </p>
        ) : (
          <p style={{ fontSize: "0.9rem" }}>You are not signed in.</p>
        )}
        {onApex && (
          <p style={{ fontSize: "0.9rem", lineHeight: 1.5, color: "#fde68a" }}>
            You are on <strong>frostedblocks.com</strong> (no www). That often uses a different II
            principal. Log out, then open{" "}
            <a
              href="https://www.frostedblocks.com/#/admin/lite"
              style={{ color: "#7dd3fc" }}
            >
              www.frostedblocks.com/#/admin/lite
            </a>{" "}
            and sign in again.
          </p>
        )}
        <p style={{ fontSize: "0.85rem", lineHeight: 1.45 }}>
          Prefer the canonical app:{" "}
          <a
            href="https://6hhqv-baaaa-aaaan-q6mxq-cai.icp0.io/#/admin/lite"
            style={{ color: "#7dd3fc" }}
          >
            6hhqv-….icp0.io/#/admin/lite
          </a>
        </p>
        {err && <p style={{ color: "#f87171", fontSize: "0.85rem" }}>{err}</p>}
        {onBack && (
          <button type="button" className="ice-btn" onClick={onBack} style={{ marginTop: "1rem" }}>
            Back
          </button>
        )}
      </div>
    );
  }

  if (!admin) {
    return <div style={{ padding: "2rem", color: "#64748b" }}>Loading controls…</div>;
  }

  return (
    <div
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "1.5rem 1rem 3rem",
        color: "#e2e8f0",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "center" }}>
        <h1 style={{ fontSize: "1.2rem", margin: 0 }}>Lite ICE controls</h1>
        {onBack && (
          <button type="button" className="ice-btn" onClick={onBack}>
            Close
          </button>
        )}
      </div>
      <p style={{ color: "#64748b", fontSize: "0.82rem", lineHeight: 1.45 }}>
        Controls <strong style={{ color: "#94a3b8" }}>lite.frostedblocks.com</strong> only. Does not
        change ICE Network economy, posts, or membership. Owner Internet Identity required.
      </p>

      <div className="ice-glass-soft" style={{ padding: "1rem", marginTop: "1rem" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#7dd3fc", marginBottom: "0.55rem" }}>
          REGISTRATIONS
        </div>
        {liteStats?.registeredUsers != null ? (
          <p style={{ margin: 0, fontSize: "1.35rem", fontWeight: 800, color: "#f8fafc" }}>
            {liteStats.registeredUsers.toLocaleString()}
            <span style={{ fontSize: "0.85rem", fontWeight: 500, color: "#94a3b8", marginLeft: "0.45rem" }}>
              registered on Lite
            </span>
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
            Could not load Lite registration count.
          </p>
        )}
        {liteStats?.posts != null && (
          <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "#64748b" }}>
            {liteStats.posts.toLocaleString()} Lite posts
          </p>
        )}
        <button
          type="button"
          className="ice-btn"
          disabled={busy}
          onClick={loadLiteStats}
          style={{ marginTop: "0.65rem" }}
        >
          Refresh count
        </button>
      </div>

      <div className="ice-glass-soft" style={{ padding: "1rem", marginTop: "0.85rem" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#7dd3fc", marginBottom: "0.65rem" }}>
          GATES
        </div>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.55rem" }}>
          <input
            type="checkbox"
            checked={admin.signupsOpen}
            disabled={busy}
            onChange={() =>
              applyWrite(() => actor.setSignupsOpen(!admin.signupsOpen))
            }
          />
          Signups open
        </label>
        <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <input
            type="checkbox"
            checked={admin.feedBridgeOpen}
            disabled={busy}
            onChange={() =>
              applyWrite(() => actor.setFeedBridgeOpen(!admin.feedBridgeOpen))
            }
          />
          Network feed bridge open
        </label>
      </div>

      <div className="ice-glass-soft" style={{ padding: "1rem", marginTop: "0.85rem" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#7dd3fc", marginBottom: "0.45rem" }}>
          BAN HANDLE
        </div>
        <p style={{ margin: "0 0 0.45rem", fontSize: "0.75rem", color: "#64748b" }}>
          Lite handles look like <code>u123</code>. Banned users cannot post.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="u42"
            style={{
              flex: 1,
              minWidth: 120,
              padding: "0.45rem 0.55rem",
              borderRadius: 8,
              border: "1px solid rgba(148,163,184,0.25)",
              background: "rgba(9,9,11,0.7)",
              color: "#e2e8f0",
            }}
          />
          <button
            type="button"
            className="ice-btn ice-btn-danger"
            disabled={busy || !handle.trim()}
            onClick={() =>
              applyWrite(async () => {
                const r = await actor.banLiteHandle(handle.trim());
                setHandle("");
                return r;
              })
            }
          >
            Ban
          </button>
          <button
            type="button"
            className="ice-btn"
            disabled={busy || !handle.trim()}
            onClick={() =>
              applyWrite(async () => {
                const r = await actor.unbanLiteHandle(handle.trim());
                setHandle("");
                return r;
              })
            }
          >
            Unban
          </button>
        </div>
        {admin.bannedLiteHandles.length > 0 && (
          <ul style={{ margin: "0.65rem 0 0", paddingLeft: "1.1rem", fontSize: "0.8rem", color: "#94a3b8" }}>
            {admin.bannedLiteHandles.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="ice-glass-soft" style={{ padding: "1rem", marginTop: "0.85rem" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#7dd3fc", marginBottom: "0.45rem" }}>
          HIDE LITE POST
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
          <input
            value={postId}
            onChange={(e) => setPostId(e.target.value)}
            placeholder="post id"
            style={{
              flex: 1,
              minWidth: 120,
              padding: "0.45rem 0.55rem",
              borderRadius: 8,
              border: "1px solid rgba(148,163,184,0.25)",
              background: "rgba(9,9,11,0.7)",
              color: "#e2e8f0",
            }}
          />
          <button
            type="button"
            className="ice-btn ice-btn-danger"
            disabled={busy || !postId.trim()}
            onClick={() =>
              applyWrite(async () => {
                const r = await actor.hideLitePost(postId.trim());
                setPostId("");
                return r;
              })
            }
          >
            Hide
          </button>
          <button
            type="button"
            className="ice-btn"
            disabled={busy || !postId.trim()}
            onClick={() =>
              applyWrite(async () => {
                const r = await actor.unhideLitePost(postId.trim());
                setPostId("");
                return r;
              })
            }
          >
            Unhide
          </button>
        </div>
        {admin.hiddenLitePostIds.length > 0 && (
          <ul style={{ margin: "0.65rem 0 0", paddingLeft: "1.1rem", fontSize: "0.8rem", color: "#94a3b8" }}>
            {admin.hiddenLitePostIds.map((id) => (
              <li key={id}>{id}</li>
            ))}
          </ul>
        )}
      </div>

      {msg && <p style={{ color: "#86efac", fontSize: "0.85rem" }}>{msg}</p>}
      {err && <p style={{ color: "#f87171", fontSize: "0.85rem" }}>{err}</p>}
    </div>
  );
}
