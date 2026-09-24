import React, { useState, useEffect } from "react";

/**
 * Master-only list of reported / hidden posts.
 */
export default function ModerationQueue({ actor }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const load = async () => {
    if (!actor) return;
    setLoading(true);
    setError("");
    try {
      const result = await actor.getReportedPosts();
      setPosts(result || []);
    } catch (err) {
      console.error(err);
      setError("Could not load reported posts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [actor]);

  const handleHide = async (postId) => {
    if (!actor) return;
    setBusyId(postId.toString());
    setInfo("");
    setError("");
    try {
      const ok = await actor.adminHidePost(postId);
      if (ok) {
        setInfo(`Post #${postId} hidden.`);
        await load();
      } else {
        setError("Hide failed.");
      }
    } catch (err) {
      console.error(err);
      setError("Hide failed.");
    } finally {
      setBusyId(null);
    }
  };

  const handleUnhide = async (postId) => {
    if (!actor) return;
    setBusyId(postId.toString());
    setInfo("");
    setError("");
    try {
      const ok = await actor.adminUnhidePost(postId);
      if (ok) {
        setInfo(`Post #${postId} restored to the feed. Reports cleared.`);
        await load();
      } else {
        setError("Unhide failed.");
      }
    } catch (err) {
      console.error(err);
      setError("Unhide failed.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
        <label style={{ fontWeight: 500, color: "#94a3b8", fontSize: "0.9rem" }}>
          Moderation queue
        </label>
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

      <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.8rem", color: "#64748b" }}>
        Reported or hidden posts. Most reports first. Unhide clears reports so it won’t auto-hide again immediately.
      </p>

      {loading && <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Loading…</p>}

      {!loading && posts.length === 0 && (
        <p style={{ color: "#475569", fontSize: "0.9rem" }}>No reported or hidden posts right now.</p>
      )}

      {posts.map((p) => {
        const id = p.id;
        const preview =
          p.content.length > 120 ? p.content.slice(0, 120) + "…" : p.content;
        const busy = busyId === id.toString();

        return (
          <div
            key={id.toString()}
            style={{
              marginBottom: "0.65rem",
              padding: "0.75rem 0.85rem",
              background: "rgba(9, 9, 11, 0.72)",
              border: p.isHidden ? "1px solid #422006" : "1px solid rgba(148, 163, 184, 0.14)",
              borderRadius: "8px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: "180px" }}>
                <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginBottom: "0.3rem" }}>
                  <strong style={{ color: "#e2e8f0" }}>#{id.toString()}</strong>
                  {" · "}
                  <span style={{ color: "#f87171" }}>
                    {Number(p.reportCount)} report{Number(p.reportCount) === 1 ? "" : "s"}
                  </span>
                  {p.isHidden && (
                    <span style={{ marginLeft: "0.4rem", color: "#fbbf24" }}>(hidden)</span>
                  )}
                </div>
                <div style={{ color: "#e2e8f0", fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>
                  {preview || "(empty)"}
                </div>
                <div style={{ fontSize: "0.75rem", color: "#475569", marginTop: "0.35rem", wordBreak: "break-all" }}>
                  {p.author.toString().slice(0, 20)}…
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.4rem" }}>
                {p.isHidden ? (
                  <button
                    type="button"
                    onClick={() => handleUnhide(id)}
                    disabled={busy}
                    style={{
                      padding: "0.4rem 0.75rem",
                      background: "#14532d",
                      color: "#86efac",
                      border: "1px solid #166534",
                      borderRadius: "6px",
                      cursor: busy ? "default" : "pointer",
                      fontSize: "0.85rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {busy ? "…" : "Unhide"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleHide(id)}
                    disabled={busy}
                    style={{
                      padding: "0.4rem 0.75rem",
                      background: "#7f1d1d",
                      color: "#fecaca",
                      border: "1px solid #991b1b",
                      borderRadius: "6px",
                      cursor: busy ? "default" : "pointer",
                      fontSize: "0.85rem",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {busy ? "…" : "Hide"}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {info && <p style={{ color: "#4ade80", fontSize: "0.85rem" }}>{info}</p>}
      {error && <p style={{ color: "#f87171", fontSize: "0.85rem" }}>{error}</p>}
    </div>
  );
}
