import React, { useCallback, useEffect, useRef, useState } from "react";
import { copyTextToClipboard } from "./copyText";

const REF_KEY = "ice-invite-ref";

export function captureInviteRefFromUrl() {
  try {
    const u = new URL(window.location.href);
    const ref = (u.searchParams.get("ref") || "").trim();
    if (ref && ref.includes("-")) {
      localStorage.setItem(REF_KEY, ref);
    }
  } catch {
    /* ignore */
  }
}

export function readInviteRef() {
  try {
    return (localStorage.getItem(REF_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function clearInviteRef() {
  try {
    localStorage.removeItem(REF_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Identity-linked invite: link embeds the inviter's II principal.
 * 15 paid Joins → free Join + site for that same identity.
 * ICE account is NOT required — only II (principal on identity).
 */
export default function InviteCard({
  actor,
  identity,
  /** When true, emphasize II-only (no ICE membership required). */
  referralOnly = false,
  compact = false,
}) {
  const [status, setStatus] = useState(null);
  const [invites, setInvites] = useState([]);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState("");
  const [copyHint, setCopyHint] = useState("");
  const inputRef = useRef(null);

  const principalFromIdentity =
    identity?.getPrincipal?.()?.toText?.() ||
    (typeof identity?.getPrincipal === "function"
      ? String(identity.getPrincipal())
      : "") ||
    "";

  const load = useCallback(async () => {
    if (!identity) return;
    // Progress queries need an authenticated actor; link itself only needs II principal.
    if (!actor?.getMyReferralStatus) {
      setStatus(null);
      return;
    }
    try {
      const st = await actor.getMyReferralStatus();
      setStatus(st);
      setErr("");
      if (actor.getMyReferralInvites) {
        try {
          const inv = await actor.getMyReferralInvites();
          setInvites(Array.isArray(inv?.invites) ? inv.invites : []);
        } catch {
          setInvites([]);
        }
      }
    } catch (e) {
      console.error(e);
      // Non-fatal: invite URL still works from II principal alone
      setErr("");
    }
  }, [actor, identity]);

  useEffect(() => {
    load();
  }, [load]);

  if (!identity && !principalFromIdentity) return null;

  const principal =
    (status?.invitePrincipal && String(status.invitePrincipal)) ||
    principalFromIdentity ||
    "";
  const inviteUrl = principal
    ? `https://frostedblocks.com/?ref=${encodeURIComponent(principal)}`
    : "";
  const count = Number(status?.count ?? 0);
  const threshold = Number(status?.threshold ?? 15);
  const eligible = !!status?.eligible;
  const claimed = !!status?.claimed;
  const pct = Math.min(100, Math.round((count / Math.max(1, threshold)) * 100));

  const selectLink = () => {
    const el = inputRef.current;
    if (!el) return;
    try {
      el.focus();
      el.select();
      el.setSelectionRange(0, el.value.length);
    } catch {
      /* ignore */
    }
  };

  const copy = async () => {
    if (!inviteUrl) {
      setCopyHint("No invite link yet — finish Internet Identity first.");
      return;
    }
    setCopyHint("");
    const ok = await copyTextToClipboard(inviteUrl);
    if (ok) {
      setCopied(true);
      setCopyHint("Copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    selectLink();
    setCopied(false);
    setCopyHint("Clipboard blocked — link selected. Press Ctrl+C (⌘C) to copy.");
  };

  return (
    <div
      className={compact ? undefined : "ice-panel"}
      style={{
        marginBottom: compact ? 0 : "1rem",
        ...(compact
          ? {}
          : {}),
      }}
    >
      {!compact && (
        <div className="ice-panel-head">
          <div>
            <h3 className="ice-panel-title">Invite users</h3>
            <p className="ice-panel-desc">
              {referralOnly ? (
                <>
                  You only need Internet Identity — <strong style={{ color: "#e2e8f0" }}>not</strong>{" "}
                  an ICE account. When{" "}
                  <strong style={{ color: "#e2e8f0" }}>{threshold}</strong> users Join and pay for a
                  website through your link, you unlock{" "}
                  <strong style={{ color: "#7dd3fc" }}>free Join + site</strong>.
                </>
              ) : (
                <>
                  Your invite is your Internet Identity. When{" "}
                  <strong style={{ color: "#e2e8f0" }}>{threshold}</strong> people Join and pay for a
                  website through your link, you get{" "}
                  <strong style={{ color: "#e2e8f0" }}>free Join + site</strong>.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      {err && <p style={{ color: "#f87171", fontSize: "0.82rem" }}>{err}</p>}

      <input
        ref={inputRef}
        type="text"
        readOnly
        value={inviteUrl || ""}
        placeholder="Your invite link appears here"
        onFocus={selectLink}
        onClick={selectLink}
        aria-label="Invite link"
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          marginTop: compact ? 0 : "0.65rem",
          padding: "0.65rem 0.75rem",
          borderRadius: 10,
          background: "rgba(0,0,0,0.28)",
          border: "1px solid rgba(125,211,252,0.28)",
          wordBreak: "break-all",
          fontFamily: "ui-monospace, monospace",
          fontSize: "0.78rem",
          color: "#e0f2fe",
          cursor: "text",
        }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginTop: "0.55rem" }}>
        <button
          type="button"
          className="ice-btn-primary"
          disabled={!inviteUrl}
          onClick={copy}
        >
          {copied ? "Copied" : "Copy invite link"}
        </button>
        {!referralOnly && (
          <button type="button" className="ice-btn" onClick={load}>
            Refresh
          </button>
        )}
        {referralOnly && actor?.getMyReferralStatus && (
          <button type="button" className="ice-btn" onClick={load}>
            Refresh progress
          </button>
        )}
      </div>

      {copyHint && (
        <p
          style={{
            margin: "0.45rem 0 0",
            fontSize: "0.78rem",
            color: copied ? "#7dd3fc" : "#fde68a",
          }}
        >
          {copyHint}
        </p>
      )}

      <div style={{ marginTop: "0.85rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.78rem",
            color: "#94a3b8",
            marginBottom: "0.35rem",
          }}
        >
          <span>
            Paid invites:{" "}
            <strong style={{ color: "#e2e8f0" }}>
              {count} / {threshold}
            </strong>
          </span>
          <span style={{ color: eligible ? "#7dd3fc" : claimed ? "#94a3b8" : "#fde68a" }}>
            {claimed
              ? "Free Join claimed"
              : eligible
              ? "Free Join unlocked"
              : `${Math.max(0, threshold - count)} to go`}
          </span>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 999,
            background: "rgba(148,163,184,0.2)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: eligible
                ? "linear-gradient(90deg,#7dd3fc,#a5b4fc)"
                : "linear-gradient(90deg,#38bdf8,#a78bfa)",
            }}
          />
        </div>
      </div>

      {invites.length > 0 && (
        <div style={{ marginTop: "0.85rem" }}>
          <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginBottom: "0.35rem" }}>
            Users who Joined via your link
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {invites.map((row) => (
              <li
                key={row.principal}
                style={{
                  padding: "0.4rem 0",
                  borderTop: "1px solid rgba(148,163,184,0.12)",
                  fontSize: "0.82rem",
                  color: "#e2e8f0",
                }}
              >
                <strong>{row.username || "—"}</strong>
                <span
                  title={row.principal}
                  style={{
                    display: "block",
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "0.7rem",
                    color: "#94a3b8",
                  }}
                >
                  {String(row.principal || "").length > 22
                    ? `${String(row.principal).slice(0, 10)}…${String(row.principal).slice(-8)}`
                    : row.principal}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
