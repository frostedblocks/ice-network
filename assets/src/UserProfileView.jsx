import React, { useState, useEffect, useCallback } from "react";
import PostCard from "./PostCard";
import NnsIcpFee from "./NnsIcpFee";
import { getIceCanisterId } from "./icpLedger";

function truncatePrincipal(text, head = 8, tail = 6) {
  const s = String(text || "");
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

function e8sLabel(e8s) {
  const n = Number(e8s) / 100_000_000;
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, "");
}

/** Soften canister tip messages that still speak in e8s. */
function formatTipMessage(raw) {
  if (!raw || typeof raw !== "string") return raw;
  let s = raw;
  s = s.replace(
    /Tip the master profile first \(at least (\d+) e8s ICP total\)/gi,
    (_, e8s) => `Tip the master profile first (at least ${e8sLabel(e8s)} ICP total)`
  );
  s = s.replace(
    /Tip (\d+) e8s more to master to unlock tipping others\./gi,
    (_, e8s) => `Tip ${e8sLabel(e8s)} ICP more to master to unlock tipping others.`
  );
  s = s.replace(
    /Tipped (\d+) e8s ICP to /gi,
    (_, e8s) => `Tipped ${e8sLabel(e8s)} ICP to `
  );
  return s;
}

/**
 * Public profile page for any user.
 * Shows avatar, username, bio, and their posts.
 * ICP tip form shows when tipping is enabled — no unlock gate.
 */
export default function UserProfileView({
  actor,
  identity,
  principal, // the profile being viewed
  currentUserPrincipal,
  onBack,
  onUserClick,
  onIcpChanged,
}) {
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eitherBlocked, setEitherBlocked] = useState(false);
  const [tipAmount, setTipAmount] = useState("0.01");
  const [tipMsg, setTipMsg] = useState("");
  const [tipBusy, setTipBusy] = useState(false);
  const [tipFeeReady, setTipFeeReady] = useState(false);
  const [tippingEnabled, setTippingEnabled] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!actor || !principal) return;

    const load = async () => {
      setLoading(true);
      try {
        let blocked = false;
        if (
          currentUserPrincipal &&
          currentUserPrincipal.toString() !== principal.toString() &&
          actor.isEitherBlocked
        ) {
          blocked = !!(await actor.isEitherBlocked(currentUserPrincipal, principal));
          setEitherBlocked(blocked);
        } else {
          setEitherBlocked(false);
        }

        const loadAuthorPosts = async () => {
          if (blocked) return [];
          if (actor.getPostsByAuthorForViewer) {
            return actor.getPostsByAuthorForViewer(principal, 30);
          }
          return actor.getPostsByAuthor(principal, 30);
        };
        const [profileResult, postsResult] = await Promise.all([
          actor.getProfile(principal),
          loadAuthorPosts(),
        ]);

        const p =
          profileResult == null
            ? null
            : Array.isArray(profileResult)
            ? profileResult.length > 0
              ? profileResult[0]
              : null
            : profileResult;
        setProfile(p && p.username !== undefined ? p : null);
        setPosts(postsResult || []);

        try {
          if (actor.getEconomyConfig) {
            const cfg = await actor.getEconomyConfig();
            setTippingEnabled(cfg.tippingEnabled !== false);
          } else if (actor.isTippingEnabled) {
            setTippingEnabled(!!(await actor.isTippingEnabled()));
          } else {
            setTippingEnabled(true);
          }
        } catch (_) {
          setTippingEnabled(true);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [actor, principal, currentUserPrincipal]);

  const icpToE8s = (icp) => {
    const s = String(icp ?? "").trim();
    if (!s) return 0n;
    const parts = s.split(".");
    const whole = BigInt(parts[0] || "0");
    let frac = (parts[1] || "").replace(/\D/g, "").slice(0, 8);
    while (frac.length < 8) frac += "0";
    return whole * 100_000_000n + BigInt(frac || "0");
  };

  const tipE8s = icpToE8s(tipAmount);
  const onTipFeeReady = useCallback((r) => setTipFeeReady(!!r), []);

  const handleTip = async () => {
    if (!principal || tipBusy) return;
    const tipFn = actor?.tipIcp || actor?.tipTokens;
    if (!tipFn) {
      setTipMsg("Tipping unavailable — redeploy ICE.");
      return;
    }
    if (tipE8s <= 0n) {
      setTipMsg("Enter a tip amount in ICP (e.g. 0.01).");
      return;
    }
    if (!tipFeeReady) {
      setTipMsg("Approve the tip with Internet Identity first.");
      return;
    }
    setTipBusy(true);
    setTipMsg("");
    try {
      const text = await tipFn.call(actor, principal, tipE8s);
      setTipMsg(formatTipMessage(typeof text === "string" ? text : "Tip sent."));
      setTipFeeReady(false);
      if (onIcpChanged) onIcpChanged();
    } catch (e) {
      setTipMsg(formatTipMessage(e?.message || "Tip failed."));
    } finally {
      setTipBusy(false);
    }
  };

  const handleCopyPrincipal = async () => {
    const full = principal?.toString?.() || String(principal || "");
    if (!full) return;
    try {
      await navigator.clipboard?.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (_) {
      setTipMsg("Could not copy principal.");
    }
  };

  if (loading) {
    return <p style={{ color: "#64748b" }}>Loading profile…</p>;
  }

  const username = profile?.username || null;
  const bio = profile?.bio || "";
  const principalText = principal?.toString?.() || String(principal || "");
  const isSelf =
    currentUserPrincipal &&
    principal &&
    currentUserPrincipal.toString() === principal.toString();

  return (
    <div className="ice-user-view">
      <button
        onClick={onBack}
        style={{
          background: "none",
          border: "none",
          color: "#7dd3fc",
          cursor: "pointer",
          marginBottom: "1.25rem",
          padding: 0,
          fontSize: "0.9rem",
          position: "relative",
          zIndex: 2,
        }}
      >
        ← Back to feed
      </button>

      <div className="ice-user-view-banner" aria-hidden="true" />

      <div className="ice-user-card">
        <div className="ice-user-avatar-wrap">
          <div className="ice-user-avatar" aria-hidden={!username}>
            {username ? username[0].toUpperCase() : "?"}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <h2
              style={{
                margin: 0,
                color: "#f8fafc",
                fontSize: "1.35rem",
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              {username || truncatePrincipal(principalText, 10, 6)}
            </h2>
          </div>

          {!isSelf &&
            !eitherBlocked &&
            tippingEnabled &&
            currentUserPrincipal &&
            identity &&
            (actor?.tipIcp || actor?.tipTokens) && (
            <div
              style={{
                marginTop: "0.85rem",
                padding: "0.75rem 0.85rem",
                borderRadius: 12,
                border: "1px solid rgba(125, 211, 252, 0.22)",
                background: "rgba(14, 16, 28, 0.45)",
              }}
            >
              <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#7dd3fc", marginBottom: "0.4rem" }}>
                TIP ICP TO THEIR II
              </div>
              <p style={{ margin: "0 0 0.55rem", fontSize: "0.75rem", color: "#94a3b8", lineHeight: 1.4 }}>
                Approve with your Internet Identity, then send. ICP goes to their II ledger account.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.45rem" }}>
                <input
                  type="text"
                  inputMode="decimal"
                  value={tipAmount}
                  onChange={(e) => {
                    setTipAmount(e.target.value);
                    setTipFeeReady(false);
                  }}
                  disabled={tipBusy}
                  className="ice-user-tip-input"
                  aria-label="Tip amount in ICP"
                  placeholder="0.01"
                />
                <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>ICP</span>
              </div>
              {tipE8s > 0n && (
                <div style={{ marginTop: "0.55rem" }}>
                  <NnsIcpFee
                    key={tipE8s.toString()}
                    identity={identity}
                    feeE8s={tipE8s}
                    spenderCanisterId={getIceCanisterId()}
                    purpose="tip"
                    onReadyChange={onTipFeeReady}
                  />
                </div>
              )}
              <button
                type="button"
                className="ice-user-tip-btn"
                disabled={tipBusy || !tipFeeReady || tipE8s <= 0n}
                onClick={handleTip}
                style={{ marginTop: "0.45rem" }}
              >
                {tipBusy ? "Sending…" : "Send tip"}
              </button>
              {tipMsg && (
                <p style={{ margin: "0.45rem 0 0", fontSize: "0.78rem", color: "#94a3b8" }}>
                  {tipMsg}
                </p>
              )}
            </div>
          )}

          {eitherBlocked ? (
            <p style={{ margin: "0.65rem 0 0 0", color: "#fca5a5", fontSize: "0.9rem" }}>
              Content hidden — one of you has blocked the other.
            </p>
          ) : (
            bio && (
              <p style={{ margin: "0.55rem 0 0 0", color: "#94a3b8", lineHeight: 1.45 }}>
                {bio}
              </p>
            )
          )}

          <div className="ice-user-principal" title={principalText}>
            <span className="ice-user-principal-text">{truncatePrincipal(principalText)}</span>
            <button
              type="button"
              className="ice-user-copy"
              onClick={handleCopyPrincipal}
              aria-label="Copy principal"
              title={copied ? "Copied" : "Copy principal"}
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M5 13l4 4L19 7"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <rect
                    x="9"
                    y="9"
                    width="11"
                    height="11"
                    rx="2"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  />
                  <path
                    d="M5 15V5a2 2 0 0 1 2-2h10"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {eitherBlocked ? (
        <div
          className="ice-glass-soft"
          style={{ textAlign: "center", padding: "2rem 1rem", color: "#64748b" }}
        >
          Posts are not visible for blocked accounts.
        </div>
      ) : (
        <>
          <h3 style={{ color: "#94a3b8", fontSize: "0.95rem", marginBottom: "1rem" }}>
            Posts ({posts.length})
          </h3>

          {posts.length === 0 ? (
            <p style={{ color: "#475569" }}>No posts yet.</p>
          ) : (
            posts.map((post) => (
              <PostCard
                key={post.id.toString()}
                post={post}
                actor={actor}
                currentUserPrincipal={currentUserPrincipal}
                onDeleted={(id) =>
                  setPosts((prev) => prev.filter((p) => p.id.toString() !== id.toString()))
                }
                onUpdated={(updated) =>
                  setPosts((prev) =>
                    prev.map((p) =>
                      p.id.toString() === updated.id.toString()
                        ? { ...p, content: updated.content }
                        : p
                    )
                  )
                }
              />
            ))
          )}
        </>
      )}
    </div>
  );
}
