import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { copyTextToClipboard } from "./copyText";
import InviteCard from "./InviteCard";

const SAVED_URL_KEY = "ice-referral-saved-url";
const SAVED_PRINCIPAL_KEY = "ice-referral-saved-principal";
const SAVED_AT_KEY = "ice-referral-saved-at";
const PAGE_URL = "https://frostedblocks.com/referral";

function readSaved() {
  try {
    return {
      url: (localStorage.getItem(SAVED_URL_KEY) || "").trim(),
      principal: (localStorage.getItem(SAVED_PRINCIPAL_KEY) || "").trim(),
      at: (localStorage.getItem(SAVED_AT_KEY) || "").trim(),
    };
  } catch {
    return { url: "", principal: "", at: "" };
  }
}

function writeSaved(url, principal) {
  try {
    localStorage.setItem(SAVED_URL_KEY, url);
    localStorage.setItem(SAVED_PRINCIPAL_KEY, principal);
    localStorage.setItem(SAVED_AT_KEY, new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}

function inviteUrlForPrincipal(principal) {
  const p = String(principal || "").trim();
  if (!p) return "";
  return `https://frostedblocks.com/?ref=${encodeURIComponent(p)}`;
}

/**
 * Dedicated II-only referral dashboard at /referral.
 * Not an ICE account — monitor invites + keep the link on this device.
 */
export default function ReferralPage({
  identity = null,
  actor = null,
  onSignIn,
  onDone,
  onJoinIce,
  bootError = "",
  isLocal = false,
}) {
  const [saved, setSaved] = useState(() => readSaved());
  const [saveMsg, setSaveMsg] = useState("");
  const [pageCopied, setPageCopied] = useState(false);
  const [status, setStatus] = useState(null);
  const inputRef = useRef(null);

  const principal = useMemo(() => {
    try {
      return identity?.getPrincipal?.()?.toText?.() || "";
    } catch {
      return "";
    }
  }, [identity]);

  const liveInviteUrl = inviteUrlForPrincipal(principal);
  const displayUrl = liveInviteUrl || saved.url || "";

  useEffect(() => {
    if (!liveInviteUrl || !principal) return;
    writeSaved(liveInviteUrl, principal);
    setSaved(readSaved());
  }, [liveInviteUrl, principal]);

  const loadStatus = useCallback(async () => {
    if (!actor?.getMyReferralStatus || !identity) {
      setStatus(null);
      return;
    }
    try {
      const st = await actor.getMyReferralStatus();
      setStatus(st);
    } catch (e) {
      console.error(e);
    }
  }, [actor, identity]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const count = Number(status?.count ?? 0);
  const threshold = Number(status?.threshold ?? 15);
  const eligible = !!status?.eligible;
  const claimed = !!status?.claimed;

  const saveOnDevice = () => {
    if (!displayUrl) {
      setSaveMsg("Sign in with Internet Identity first to generate your link.");
      return;
    }
    const p = principal || saved.principal || "";
    const ok = writeSaved(displayUrl, p);
    setSaved(readSaved());
    setSaveMsg(
      ok
        ? "Saved on this device. Reopen https://frostedblocks.com/referral anytime — Sign in with II to refresh progress."
        : "Could not save on this device (storage blocked)."
    );
  };

  const copyPageUrl = async () => {
    const ok = await copyTextToClipboard(PAGE_URL);
    setPageCopied(ok);
    setTimeout(() => setPageCopied(false), 2000);
  };

  const downloadLinkFile = () => {
    if (!displayUrl) return;
    const body = [
      "ICE Network — referral invite",
      "",
      `Invite link: ${displayUrl}`,
      `Referral page: ${PAGE_URL}`,
      principal ? `Your II principal: ${principal}` : "",
      "",
      "Invite 15 users who Join and get canister sites → free Join + site for you.",
      "You only need Internet Identity to refer — not an ICE account.",
    ]
      .filter(Boolean)
      .join("\n");
    const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ice-referral-link.txt";
    a.click();
    URL.revokeObjectURL(a.href);
    setSaveMsg("Downloaded ice-referral-link.txt — keep it somewhere safe.");
  };

  return (
    <div style={styles.page}>
      <div style={styles.orbs} aria-hidden="true">
        <div style={{ ...styles.orb, ...styles.orbA }} />
        <div style={{ ...styles.orb, ...styles.orbB }} />
      </div>

      <div style={styles.wrap}>
        <header style={styles.header}>
          <a href="/" style={styles.brandLink}>
            <span style={styles.logo}>ICE</span>
            <span>
              <span style={styles.brandName}>Referral program</span>
              <span style={styles.domain}>frostedblocks.com/referral</span>
            </span>
          </a>
          <div style={styles.headerActions}>
            <a href="/" style={styles.navLink}>
              Home
            </a>
            {identity ? (
              <button type="button" onClick={onDone} style={styles.ghostBtn}>
                Sign out II
              </button>
            ) : (
              <button type="button" onClick={onSignIn} style={styles.loginBtn}>
                {isLocal ? "Continue (local)" : "Sign in with II"}
              </button>
            )}
          </div>
        </header>

        {bootError && (
          <div style={styles.errorBox}>
            <strong>Sign in</strong>
            <div style={{ marginTop: "0.35rem" }}>{bootError}</div>
          </div>
        )}

        <main style={styles.main}>
          <section style={styles.glass}>
            <div style={styles.frost} aria-hidden="true" />
            <div style={styles.accent} />
            <p style={styles.eyebrow}>II only — not an ICE account</p>
            <h1 style={styles.h1}>
              Your referral <span style={styles.h1Ice}>dashboard</span>
            </h1>
            <p style={styles.lead}>
              Monitor how many users Joined through your link. Bookmark this page and save your
              invite link for later. When{" "}
              <strong style={{ color: "#e0f2fe" }}>{threshold} users</strong> pay Join and get
              canister sites, you unlock{" "}
              <strong style={{ color: "#7dd3fc" }}>free Join + site</strong>.
            </p>

            {!identity && (
              <div style={styles.gate}>
                <p style={{ margin: "0 0 0.75rem", color: "#94a3b8", fontSize: "0.9rem" }}>
                  Sign in with Internet Identity to load live progress. Your invite link is built
                  from your II — no ICE registration required.
                </p>
                <button type="button" onClick={onSignIn} style={styles.primaryBtn}>
                  {isLocal ? "Continue (local)" : "Sign in with II to open dashboard"}
                </button>
              </div>
            )}

            {identity && (
              <>
                <div style={styles.statsRow}>
                  <div style={styles.stat}>
                    <div style={styles.statLabel}>Paid referrals</div>
                    <div style={styles.statValue}>
                      {count} / {threshold}
                    </div>
                  </div>
                  <div style={styles.stat}>
                    <div style={styles.statLabel}>Status</div>
                    <div
                      style={{
                        ...styles.statValue,
                        fontSize: "1.05rem",
                        color: claimed
                          ? "#94a3b8"
                          : eligible
                          ? "#7dd3fc"
                          : "#fde68a",
                      }}
                    >
                      {claimed
                        ? "Free Join claimed"
                        : eligible
                        ? "Free Join unlocked"
                        : `${Math.max(0, threshold - count)} to go`}
                    </div>
                  </div>
                </div>

                <div style={styles.cardBlock}>
                  <InviteCard identity={identity} actor={actor} referralOnly />
                </div>

                {eligible && !claimed && (
                  <div style={styles.unlockBanner}>
                    <strong>Free Join unlocked.</strong> You can create your ICE account without
                    paying.
                    <button type="button" onClick={onJoinIce} style={styles.primaryBtnCompact}>
                      Claim free Join + site
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Saved / bookmark section — always visible */}
            <div style={styles.saveBox}>
              <h2 style={styles.saveTitle}>Save for later</h2>
              <p style={styles.saveDesc}>
                Keep this page bookmarked. Your invite link is also stored on this device after you
                sign in once.
              </p>

              <label style={styles.label}>Referral page (bookmark this)</label>
              <div style={styles.row}>
                <input
                  type="text"
                  readOnly
                  value={PAGE_URL}
                  onFocus={(e) => e.target.select()}
                  style={styles.input}
                />
                <button type="button" onClick={copyPageUrl} style={styles.secondaryBtn}>
                  {pageCopied ? "Copied" : "Copy page"}
                </button>
              </div>

              <label style={styles.label}>Your invite link</label>
              <div style={styles.row}>
                <input
                  ref={inputRef}
                  type="text"
                  readOnly
                  value={displayUrl}
                  placeholder="Sign in with II to generate your personal invite link"
                  onFocus={(e) => e.target.select()}
                  style={styles.input}
                />
              </div>

              <div style={styles.btnRow}>
                <button type="button" onClick={saveOnDevice} style={styles.secondaryBtn} disabled={!displayUrl}>
                  Save link on this device
                </button>
                <button
                  type="button"
                  onClick={downloadLinkFile}
                  style={styles.secondaryBtn}
                  disabled={!displayUrl}
                >
                  Download .txt
                </button>
                {identity && (
                  <button type="button" onClick={loadStatus} style={styles.secondaryBtn}>
                    Refresh progress
                  </button>
                )}
              </div>

              {saveMsg && <p style={styles.saveMsg}>{saveMsg}</p>}

              {saved.url && !identity && (
                <p style={styles.savedNote}>
                  Saved link on this device
                  {saved.at ? ` · ${new Date(saved.at).toLocaleString()}` : ""}:
                  <br />
                  <code style={styles.code}>{saved.url}</code>
                </p>
              )}
            </div>

            <p style={styles.foot}>
              <a href="/" style={styles.footLink}>
                ← Back to ICE landing
              </a>
              {" · "}
              Prefer to join ICE now?{" "}
              <button type="button" onClick={onJoinIce} style={styles.textBtn}>
                Create account
              </button>
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    position: "relative",
    background: "#07070b",
    color: "#e2e8f0",
    overflowX: "hidden",
  },
  orbs: { position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0 },
  orb: { position: "absolute", borderRadius: "50%", filter: "blur(80px)", opacity: 0.45 },
  orbA: {
    width: 420,
    height: 420,
    top: -80,
    left: -60,
    background: "radial-gradient(circle, rgba(125,211,252,0.35), transparent 70%)",
  },
  orbB: {
    width: 380,
    height: 380,
    bottom: -40,
    right: -40,
    background: "radial-gradient(circle, rgba(167,139,250,0.28), transparent 70%)",
  },
  wrap: {
    position: "relative",
    zIndex: 1,
    maxWidth: 720,
    margin: "0 auto",
    padding: "1.25rem 1rem 2.5rem",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    marginBottom: "1.15rem",
    flexWrap: "wrap",
  },
  brandLink: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
    textDecoration: "none",
    color: "inherit",
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 800,
    fontSize: "0.75rem",
    letterSpacing: "0.04em",
    color: "#0c1929",
    background: "linear-gradient(135deg, #e0f2fe, #7dd3fc, #a5b4fc)",
  },
  brandName: { display: "block", fontWeight: 750, fontSize: "0.95rem", color: "#f0f9ff" },
  domain: { display: "block", fontSize: "0.72rem", color: "#64748b" },
  headerActions: { display: "flex", gap: "0.45rem", alignItems: "center" },
  navLink: {
    color: "#94a3b8",
    fontSize: "0.82rem",
    fontWeight: 600,
    textDecoration: "none",
    padding: "0.35rem 0.45rem",
  },
  loginBtn: {
    borderRadius: 999,
    border: "1px solid rgba(125, 211, 252, 0.4)",
    background: "rgba(56, 189, 248, 0.12)",
    color: "#7dd3fc",
    fontSize: "0.85rem",
    fontWeight: 700,
    padding: "0.45rem 1.05rem",
    cursor: "pointer",
  },
  ghostBtn: {
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.28)",
    background: "transparent",
    color: "#94a3b8",
    fontSize: "0.82rem",
    fontWeight: 650,
    padding: "0.4rem 0.9rem",
    cursor: "pointer",
  },
  main: {},
  glass: {
    position: "relative",
    overflow: "hidden",
    background:
      "linear-gradient(155deg, rgba(8, 24, 42, 0.9) 0%, rgba(15, 23, 42, 0.82) 45%, rgba(30, 27, 55, 0.75) 100%)",
    backdropFilter: "blur(22px)",
    WebkitBackdropFilter: "blur(22px)",
    border: "1px solid rgba(125, 211, 252, 0.38)",
    boxShadow:
      "0 12px 48px rgba(14, 165, 233, 0.14), inset 0 1px 0 rgba(255,255,255,0.1)",
    borderRadius: "1.35rem",
    padding: "1.35rem 1.35rem 1.5rem",
  },
  frost: {
    pointerEvents: "none",
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(ellipse 80% 55% at 12% -10%, rgba(186, 230, 253, 0.2), transparent 55%), radial-gradient(ellipse 60% 45% at 95% 110%, rgba(165, 180, 252, 0.14), transparent 50%)",
  },
  accent: {
    position: "relative",
    height: 1,
    width: "100%",
    marginBottom: "1rem",
    background:
      "linear-gradient(90deg, transparent, rgba(186,230,253,0.75), rgba(125,211,252,0.85), rgba(165,180,252,0.65), transparent)",
  },
  eyebrow: {
    position: "relative",
    fontSize: "0.68rem",
    fontWeight: 700,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: "rgba(186, 230, 253, 0.95)",
    margin: "0 0 0.45rem",
  },
  h1: {
    position: "relative",
    margin: "0 0 0.55rem",
    fontSize: "clamp(1.45rem, 3.5vw, 1.9rem)",
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "#f0f9ff",
  },
  h1Ice: {
    background: "linear-gradient(90deg, #e0f2fe, #7dd3fc, #a5b4fc, #c4b5fd)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  },
  lead: {
    position: "relative",
    margin: "0 0 1.1rem",
    fontSize: "0.92rem",
    lineHeight: 1.55,
    color: "#94a3b8",
  },
  gate: { position: "relative", marginBottom: "1rem" },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: "0.85rem 1.25rem",
    border: "1px solid rgba(186, 230, 253, 0.45)",
    borderRadius: "0.95rem",
    fontSize: "0.98rem",
    fontWeight: 750,
    color: "#0c1929",
    cursor: "pointer",
    background: "linear-gradient(135deg, #e0f2fe 0%, #7dd3fc 40%, #818cf8 78%, #a78bfa 100%)",
    boxShadow: "0 6px 32px rgba(56, 189, 248, 0.38)",
  },
  primaryBtnCompact: {
    display: "block",
    width: "100%",
    marginTop: "0.65rem",
    padding: "0.7rem 1rem",
    border: "none",
    borderRadius: "0.85rem",
    fontSize: "0.9rem",
    fontWeight: 750,
    color: "#0c1929",
    cursor: "pointer",
    background: "linear-gradient(135deg, #e0f2fe, #7dd3fc, #a78bfa)",
  },
  statsRow: {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
    gap: "0.55rem",
    marginBottom: "1rem",
  },
  stat: {
    padding: "0.75rem 0.85rem",
    borderRadius: 12,
    background: "rgba(0,0,0,0.28)",
    border: "1px solid rgba(125,211,252,0.22)",
  },
  statLabel: { fontSize: "0.72rem", color: "#94a3b8" },
  statValue: { fontSize: "1.35rem", fontWeight: 800, color: "#e0f2fe", marginTop: 2 },
  cardBlock: {
    position: "relative",
    marginBottom: "1rem",
    padding: "0.35rem 0.15rem",
  },
  unlockBanner: {
    position: "relative",
    marginBottom: "1rem",
    padding: "0.85rem",
    borderRadius: 12,
    border: "1px solid rgba(125,211,252,0.45)",
    background: "rgba(56,189,248,0.1)",
    color: "#bae6fd",
    fontSize: "0.88rem",
  },
  saveBox: {
    position: "relative",
    marginTop: "0.25rem",
    padding: "1rem",
    borderRadius: 14,
    border: "1px solid rgba(125, 211, 252, 0.28)",
    background: "rgba(8, 16, 32, 0.45)",
  },
  saveTitle: {
    margin: "0 0 0.35rem",
    fontSize: "1rem",
    fontWeight: 750,
    color: "#f0f9ff",
  },
  saveDesc: {
    margin: "0 0 0.85rem",
    fontSize: "0.82rem",
    color: "#94a3b8",
    lineHeight: 1.45,
  },
  label: {
    display: "block",
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#7dd3fc",
    marginBottom: "0.35rem",
  },
  row: { display: "flex", gap: "0.45rem", marginBottom: "0.75rem", flexWrap: "wrap" },
  input: {
    flex: "1 1 12rem",
    minWidth: 0,
    boxSizing: "border-box",
    padding: "0.65rem 0.75rem",
    borderRadius: 10,
    background: "rgba(0,0,0,0.28)",
    border: "1px solid rgba(125,211,252,0.28)",
    fontFamily: "ui-monospace, monospace",
    fontSize: "0.78rem",
    color: "#e0f2fe",
  },
  secondaryBtn: {
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.28)",
    background: "rgba(9,9,11,0.45)",
    color: "#e2e8f0",
    fontSize: "0.82rem",
    fontWeight: 650,
    padding: "0.55rem 0.85rem",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  btnRow: { display: "flex", flexWrap: "wrap", gap: "0.45rem" },
  saveMsg: { margin: "0.65rem 0 0", fontSize: "0.78rem", color: "#7dd3fc", lineHeight: 1.45 },
  savedNote: { margin: "0.75rem 0 0", fontSize: "0.78rem", color: "#94a3b8", lineHeight: 1.45 },
  code: { color: "#bae6fd", wordBreak: "break-all", fontSize: "0.72rem" },
  foot: {
    position: "relative",
    margin: "1.1rem 0 0",
    fontSize: "0.78rem",
    color: "#64748b",
    textAlign: "center",
  },
  footLink: { color: "#7dd3fc", textDecoration: "none", fontWeight: 650 },
  textBtn: {
    border: "none",
    background: "transparent",
    color: "#7dd3fc",
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
    fontSize: "inherit",
  },
  errorBox: {
    marginBottom: "0.85rem",
    padding: "0.75rem 0.9rem",
    borderRadius: 12,
    background: "rgba(127,29,29,0.45)",
    border: "1px solid rgba(248,113,113,0.4)",
    color: "#fecaca",
    fontSize: "0.85rem",
  },
};
