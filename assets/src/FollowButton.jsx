import React, { useState, useEffect } from "react";

/**
 * Follow / Unfollow + optional Block for a target principal.
 * Hides Follow when either side has blocked the other.
 */
export default function FollowButton({
  actor,
  targetPrincipal,
  currentUserPrincipal,
  showBlock = true,
  compact = false,
  frostedPills = false,
  onChanged,
}) {
  const [isFollowing, setIsFollowing] = useState(false);
  const [iBlockedThem, setIBlockedThem] = useState(false);
  const [theyBlockedMe, setTheyBlockedMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");

  if (!targetPrincipal || !currentUserPrincipal) return null;
  if (targetPrincipal.toString() === currentUserPrincipal.toString()) return null;

  const refresh = async () => {
    if (!actor || !currentUserPrincipal) return;
    try {
      const tasks = [actor.getFollowing(currentUserPrincipal)];
      if (actor.isBlocked) {
        tasks.push(actor.isBlocked(currentUserPrincipal, targetPrincipal));
        tasks.push(actor.isBlocked(targetPrincipal, currentUserPrincipal));
      }
      const results = await Promise.all(tasks);
      const list = results[0] || [];
      setIsFollowing(
        list.some((p) => p.toString() === targetPrincipal.toString())
      );
      if (results.length >= 3) {
        setIBlockedThem(!!results[1]);
        setTheyBlockedMe(!!results[2]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setChecked(true);
    }
  };

  useEffect(() => {
    setChecked(false);
    refresh();
  }, [actor, currentUserPrincipal, targetPrincipal]);

  const eitherBlocked = iBlockedThem || theyBlockedMe;

  const handleFollowToggle = async () => {
    if (!actor || loading || eitherBlocked) return;
    setLoading(true);
    setError("");
    try {
      if (isFollowing) {
        const result = await actor.unfollow(targetPrincipal);
        const text = typeof result === "string" ? result : "Unfollowed";
        if (/unfollowed/i.test(text) || result === undefined) {
          setIsFollowing(false);
          if (onChanged) onChanged({ action: "unfollow" });
        } else {
          setError(text);
        }
      } else {
        const result = await actor.follow(targetPrincipal);
        const text = typeof result === "string" ? result : "Following";
        if (/^following$/i.test(text) || result === undefined) {
          setIsFollowing(true);
          if (onChanged) onChanged({ action: "follow" });
        } else {
          setError(text);
          if (/block/i.test(text)) {
            await refresh();
          }
        }
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Action failed");
    } finally {
      setLoading(false);
    }
  };

  const handleBlock = async () => {
    if (!actor || loading || !actor.block) return;
    if (!window.confirm("Block this user? You will both stop following each other.")) return;
    setLoading(true);
    setError("");
    try {
      const result = await actor.block(targetPrincipal);
      const text = typeof result === "string" ? result : "Blocked";
      if (/blocked/i.test(text)) {
        setIBlockedThem(true);
        setIsFollowing(false);
        if (onChanged) onChanged({ action: "block" });
      } else {
        setError(text);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Block failed");
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async () => {
    if (!actor || loading || !actor.unblock) return;
    setLoading(true);
    setError("");
    try {
      const result = await actor.unblock(targetPrincipal);
      const text = typeof result === "string" ? result : "Unblocked";
      if (/unblocked/i.test(text)) {
        setIBlockedThem(false);
        if (onChanged) onChanged({ action: "unblock" });
      } else {
        setError(text);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Unblock failed");
    } finally {
      setLoading(false);
    }
  };

  if (!checked) return null;

  const btnBase = {
    fontSize: compact ? "0.75rem" : "0.8rem",
    padding: compact ? "0.18rem 0.55rem" : "0.2rem 0.75rem",
    borderRadius: "12px",
    cursor: loading ? "default" : "pointer",
    opacity: loading ? 0.7 : 1,
  };

  if (frostedPills) {
    return (
      <div
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: "0.25rem",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "0.4rem",
            flexWrap: "wrap",
            justifyContent: "flex-end",
          }}
        >
          {theyBlockedMe && !iBlockedThem && (
            <span className="ice-pill ice-pill--muted">Blocked you</span>
          )}

          {iBlockedThem ? (
            <button
              type="button"
              className="ice-pill ice-pill--unblock"
              onClick={handleUnblock}
              disabled={loading}
            >
              {loading ? "…" : "Unblock"}
            </button>
          ) : (
            !theyBlockedMe && (
              <button
                type="button"
                className={`ice-pill ${isFollowing ? "ice-pill--unfollow" : "ice-pill--follow"}`}
                onClick={handleFollowToggle}
                disabled={loading}
              >
                {loading ? "…" : isFollowing ? "Unfollow" : "Follow"}
              </button>
            )
          )}

          {showBlock && !iBlockedThem && (
            <button
              type="button"
              className="ice-pill ice-pill--block"
              onClick={handleBlock}
              disabled={loading}
            >
              Block
            </button>
          )}
        </div>
        {error && (
          <span
            style={{
              fontSize: "0.7rem",
              color: "#f87171",
              maxWidth: "12rem",
              textAlign: "right",
            }}
          >
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
        {theyBlockedMe && !iBlockedThem && (
          <span
            style={{
              ...btnBase,
              border: "1px solid rgba(248, 113, 113, 0.35)",
              background: "rgba(127, 29, 29, 0.25)",
              color: "#fca5a5",
              cursor: "default",
            }}
          >
            Blocked you
          </span>
        )}

        {iBlockedThem ? (
          <button
            type="button"
            onClick={handleUnblock}
            disabled={loading}
            style={{
              ...btnBase,
              border: "1px solid rgba(251, 191, 36, 0.4)",
              background: "rgba(120, 53, 15, 0.35)",
              color: "#fcd34d",
            }}
          >
            {loading ? "…" : "Unblock"}
          </button>
        ) : (
          !theyBlockedMe && (
            <button
              type="button"
              onClick={handleFollowToggle}
              disabled={loading}
              style={{
                ...btnBase,
                border: isFollowing ? "1px solid rgba(148, 163, 184, 0.22)" : "1px solid #818cf8",
                background: isFollowing ? "rgba(18, 20, 32, 0.55)" : "rgba(30, 58, 95, 0.65)",
                color: isFollowing ? "#94a3b8" : "#7dd3fc",
              }}
            >
              {loading ? "…" : isFollowing ? "Unfollow" : "Follow"}
            </button>
          )
        )}

        {showBlock && !iBlockedThem && (
          <button
            type="button"
            onClick={handleBlock}
            disabled={loading}
            style={{
              ...btnBase,
              border: "1px solid rgba(248, 113, 113, 0.3)",
              background: "transparent",
              color: "#f87171",
            }}
          >
            Block
          </button>
        )}
      </div>
      {error && (
        <span style={{ fontSize: "0.7rem", color: "#f87171", maxWidth: "12rem", textAlign: "right" }}>
          {error}
        </span>
      )}
    </div>
  );
}
