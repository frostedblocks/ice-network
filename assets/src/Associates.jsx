import React, { useState, useEffect, useCallback } from "react";
import Username from "./Username";
import FollowButton from "./FollowButton";

/**
 * Associates page: Following / Followers / Blocked tabs.
 * @param {{ actor: any, identity: any, onUserClick?: (p: any) => void, onBack?: () => void }} props
 */
export default function Associates({ actor, identity, onUserClick, onBack }) {
  const [tab, setTab] = useState("following"); // following | followers | blocked
  const [following, setFollowing] = useState([]);
  const [followers, setFollowers] = useState([]);
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const me = identity ? identity.getPrincipal() : null;

  const load = useCallback(async () => {
    if (!actor || !me) return;
    setLoading(true);
    setError("");
    try {
      if (actor.getAssociates) {
        const data = await actor.getAssociates(me);
        setFollowing(Array.isArray(data?.following) ? data.following : []);
        setFollowers(Array.isArray(data?.followers) ? data.followers : []);
      } else {
        const [f, fr] = await Promise.all([
          actor.getFollowing(me),
          actor.getFollowers ? actor.getFollowers(me) : Promise.resolve([]),
        ]);
        setFollowing(Array.isArray(f) ? f : []);
        setFollowers(Array.isArray(fr) ? fr : []);
      }
      if (actor.getBlocked) {
        const b = await actor.getBlocked(me);
        setBlocked(Array.isArray(b) ? b : []);
      } else {
        setBlocked([]);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not load associates.");
    } finally {
      setLoading(false);
    }
  }, [actor, me]);

  useEffect(() => {
    load();
  }, [load]);

  const list =
    tab === "following" ? following : tab === "followers" ? followers : blocked;

  const tabBtn = (id, label, count) => {
    const active = tab === id;
    return (
      <button
        type="button"
        onClick={() => setTab(id)}
        style={{
          flex: 1,
          minWidth: "5.5rem",
          padding: "0.45rem 0.6rem",
          borderRadius: "8px",
          border: active
            ? "1px solid rgba(56, 189, 248, 0.45)"
            : "1px solid rgba(148, 163, 184, 0.18)",
          background: active
            ? "linear-gradient(135deg, rgba(56, 189, 248, 0.22) 0%, rgba(129, 140, 248, 0.2) 100%)"
            : "rgba(255,255,255,0.03)",
          color: active ? "#e0f2fe" : "#94a3b8",
          fontWeight: active ? 600 : 500,
          fontSize: "0.85rem",
          cursor: "pointer",
        }}
      >
        {label}
        <span style={{ opacity: 0.75, marginLeft: "0.3rem" }}>({count})</span>
      </button>
    );
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              style={{
                background: "none",
                border: "none",
                color: "#7dd3fc",
                cursor: "pointer",
                padding: 0,
                fontSize: "0.9rem",
              }}
            >
              ← Back
            </button>
          )}
          <div>
            <h2 style={{ margin: 0, fontSize: "1.2rem", color: "#f8fafc" }}>Network</h2>
            <p className="ice-page-desc" style={{ marginTop: "0.25rem" }}>
              Following, followers, and blocked accounts.
            </p>
          </div>
        </div>
        <button type="button" onClick={load} className="ice-btn" disabled={loading}>
          Refresh
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.15rem", flexWrap: "wrap" }}>
        {tabBtn("following", "Following", following.length)}
        {tabBtn("followers", "Followers", followers.length)}
        {tabBtn("blocked", "Blocked", blocked.length)}
      </div>

      {loading && <p style={{ color: "#64748b" }}>Loading…</p>}
      {error && <p style={{ color: "#f87171" }}>{error}</p>}

      {!loading && !error && list.length === 0 && (
        <div
          className="ice-glass-soft"
          style={{
            textAlign: "center",
            padding: "2rem 1rem",
            color: "#64748b",
            borderStyle: "dashed",
          }}
        >
          {tab === "following" && <p style={{ margin: 0 }}>You’re not following anyone yet.</p>}
          {tab === "followers" && <p style={{ margin: 0 }}>No followers yet.</p>}
          {tab === "blocked" && <p style={{ margin: 0 }}>No blocked users.</p>}
        </div>
      )}

      {!loading &&
        !error &&
        list.map((p) => {
          const key = p.toString();
          return (
            <div
              key={key}
              className="ice-glass-soft"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                padding: "0.75rem 1rem",
                marginBottom: "0.65rem",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={() => onUserClick && onUserClick(p)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: onUserClick ? "pointer" : "default",
                  textAlign: "left",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <Username actor={actor} principal={p} onClick={onUserClick} />
                <div
                  style={{
                    fontSize: "0.7rem",
                    color: "#475569",
                    marginTop: "0.2rem",
                    wordBreak: "break-all",
                  }}
                >
                  {key}
                </div>
              </button>

              <FollowButton
                actor={actor}
                targetPrincipal={p}
                currentUserPrincipal={me}
                showBlock={tab !== "blocked"}
                compact
                onChanged={() => load()}
              />
            </div>
          );
        })}
    </div>
  );
}
