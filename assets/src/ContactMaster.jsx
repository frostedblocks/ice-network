import React, { useState, useEffect, useCallback, useRef } from "react";
import { createAnonymousMessagingActor } from "./actors";
import TimeAgo from "./TimeAgo";
import {
  generateGuestToken,
  encryptGuestPayload,
  decryptGuestPayload,
  formatGuestDisplay,
} from "./guestCrypto";

const GUEST_TOKEN_KEY = "ice-guest-chat-token";
const MAX_GUEST_LEN = 400;
const TRUSTED_MASTERS = new Set([
  "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae",
  "4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe",
  "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae",
  "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae",
  "vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe",
]);

function readGuestTokenFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search || "");
    return (params.get("guest") || "").trim();
  } catch {
    return "";
  }
}

function persistGuestToken(token) {
  if (!token) return;
  try {
    localStorage.setItem(GUEST_TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("guest", token);
    window.history.replaceState({}, "", url.toString());
  } catch {
    /* ignore */
  }
}

function clearGuestToken() {
  try {
    localStorage.removeItem(GUEST_TOKEN_KEY);
  } catch {
    /* ignore */
  }
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("guest");
    window.history.replaceState({}, "", url.toString());
  } catch {
    /* ignore */
  }
}

function loadStoredToken() {
  const fromUrl = readGuestTokenFromUrl();
  if (fromUrl) return fromUrl;
  try {
    return (localStorage.getItem(GUEST_TOKEN_KEY) || "").trim();
  } catch {
    return "";
  }
}

function unwrapVariant(result) {
  if (!result || typeof result !== "object") return null;
  if ("ok" in result) return { ok: result.ok };
  if ("err" in result) return { err: result.err };
  return null;
}

function unwrapOpt(val) {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) return val.length > 0 ? val[0] : null;
  return val;
}

function formatExpiry(expiryNs, nowMs) {
  if (expiryNs == null) return null;
  const secs = Math.max(0, Math.floor((Number(expiryNs) / 1e6 - nowMs) / 1000));
  if (secs <= 0) return "Closing soon…";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${s}s left`;
  return `${s}s left`;
}

function principalText(p) {
  try {
    return p?.toText?.() || String(p || "");
  } catch {
    return "";
  }
}

function isFounderPrincipal(p) {
  return TRUSTED_MASTERS.has(principalText(p));
}

/**
 * Compact pre-sign-in encrypted chat with the master (guest UX).
 */
export default function ContactMaster() {
  const fromUrl = !!readGuestTokenFromUrl();
  const [open, setOpen] = useState(fromUrl);
  const [token, setToken] = useState(() => loadStoredToken());
  const [fromLabel, setFromLabel] = useState("");
  const [content, setContent] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [expiryNs, setExpiryNs] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [justStarted, setJustStarted] = useState(false);
  const threadRef = useRef(null);

  const chatLink = token
    ? `${window.location.origin}${window.location.pathname}?guest=${encodeURIComponent(token)}`
    : "";

  const inChat = !!token;
  const hasReplies = messages.some((m) => m.isMaster);
  const guestSinceReply = (() => {
    let n = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].isMaster) break;
      n += 1;
    }
    return n;
  })();
  const guestCanSend = guestSinceReply < 3;
  const guestLeft = Math.max(0, 3 - guestSinceReply);

  const loadThread = useCallback(async (tok) => {
    if (!tok) {
      setMessages([]);
      setExpiryNs(null);
      return;
    }
    try {
      const messaging = await createAnonymousMessagingActor();
      if (typeof messaging.getGuestMessagesByToken !== "function") return;
      const list = await messaging.getGuestMessagesByToken(tok);
      const decoded = await Promise.all(
        (list || []).map(async (m) => {
          const dec = await decryptGuestPayload(m.content, tok);
          return {
            id: m.id,
            from: m.from,
            timestamp: m.timestamp,
            display: formatGuestDisplay(dec),
            isMaster: isFounderPrincipal(m.from),
          };
        })
      );
      setMessages(decoded);
      if (typeof messaging.getGuestInboxExpiryByToken === "function") {
        const exp = unwrapOpt(await messaging.getGuestInboxExpiryByToken(tok));
        setExpiryNs(exp != null ? Number(exp) : null);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    if (token) loadThread(token);
  }, [token, loadThread]);

  useEffect(() => {
    if (!token) return undefined;
    const poll = setInterval(() => loadThread(token), 10000);
    return () => clearInterval(poll);
  }, [token, loadThread]);

  useEffect(() => {
    if (expiryNs == null) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiryNs]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = async (e) => {
    e?.preventDefault?.();
    const body = content.trim();
    if (!body) {
      setErr("Write a short message first.");
      return;
    }
    setBusy(true);
    setErr("");
    setInfo("");
    const wasNew = !token;
    try {
      const messaging = await createAnonymousMessagingActor();
      if (typeof messaging.startOrContinueGuestChat !== "function") {
        setErr("Guest chat is not available on this build yet.");
        return;
      }
      const chatToken = token || generateGuestToken();
      const cipher = await encryptGuestPayload(
        { name: token ? "" : fromLabel.trim(), body },
        chatToken
      );
      const raw = await messaging.startOrContinueGuestChat(chatToken, "", cipher);
      const parsed = unwrapVariant(raw);
      if (!parsed) {
        setErr("Unexpected response. Try again.");
        return;
      }
      if (parsed.err) {
        setErr(parsed.err);
        if (/expired|invalid chat link/i.test(parsed.err)) {
          clearGuestToken();
          setToken("");
          setMessages([]);
          setExpiryNs(null);
          setJustStarted(false);
        }
        return;
      }
      const nextToken = parsed.ok.token;
      setToken(nextToken);
      persistGuestToken(nextToken);
      setContent("");
      setOpen(true);
      if (wasNew) {
        setJustStarted(true);
        setInfo("Chat started. Copy your private link below — you’ll need it to see replies.");
      } else {
        setInfo("Sent. This page refreshes for new replies.");
      }
      await loadThread(nextToken);
    } catch (e2) {
      console.error(e2);
      setErr(e2?.message || "Could not send. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!chatLink) return;
    try {
      await navigator.clipboard.writeText(chatLink);
      setCopied(true);
      setJustStarted(false);
      setInfo("Link copied. Bookmark it or keep this tab open.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setErr("Could not copy — select the link and copy it yourself.");
    }
  };

  const startFresh = () => {
    clearGuestToken();
    setToken("");
    setMessages([]);
    setExpiryNs(null);
    setJustStarted(false);
    setInfo("");
    setErr("");
    setContent("");
    setFromLabel("");
  };

  const expiryLabel = formatExpiry(expiryNs, nowMs);

  return (
    <section className="ice-contact-master" style={styles.wrap}>
      <button
        type="button"
        className="ice-contact-toggle"
        style={styles.toggle}
        onClick={() => {
          setOpen((o) => !o);
          setErr("");
        }}
        aria-expanded={open}
      >
        <span style={styles.toggleTitle}>
          {inChat ? (hasReplies ? "Chat with founder" : "Waiting for reply") : "Message the founder"}
        </span>
        <span style={styles.toggleHint}>
          {open ? "Hide" : inChat ? "Encrypted · continue" : "No account needed"}
        </span>
      </button>

      {open && (
        <div style={styles.body}>
          {!inChat && (
            <>
              <p style={styles.lead}>
                Send a short encrypted note. You’ll get a <strong style={styles.em}>private link</strong>{" "}
                to keep chatting — no sign-in.
              </p>
              <ul style={styles.steps}>
                <li>Write your message (optional name/contact)</li>
                <li>
                  <strong style={styles.em}>Copy &amp; save your link</strong> after sending
                </li>
                <li>Up to <strong style={styles.em}>3 messages</strong> until the founder replies</li>
                <li>Reopen the link to see replies (ends 2h after the founder replies)</li>
              </ul>
            </>
          )}

          {inChat && (
            <div style={{ ...styles.saveCard, ...(justStarted ? styles.saveCardPulse : null) }}>
              <div style={styles.saveTitle}>
                {justStarted ? "Save this link now" : "Your private chat link"}
              </div>
              <p style={styles.saveHint}>
                This link is your key. Anyone with it can read the chat. Keep this tab or bookmark
                the link to see when the founder replies.
              </p>
              <div style={styles.linkRow}>
                <input
                  readOnly
                  value={chatLink}
                  style={styles.linkInput}
                  aria-label="Private chat link"
                  onFocus={(e) => e.target.select()}
                />
                <button type="button" onClick={copyLink} style={styles.copyBtn}>
                  {copied ? "Copied ✓" : "Copy link"}
                </button>
              </div>
              <div style={styles.metaRow}>
                {expiryLabel ? <span style={styles.expiry}>{expiryLabel}</span> : <span />}
                <button type="button" onClick={startFresh} style={styles.freshBtn}>
                  Start new chat
                </button>
              </div>
            </div>
          )}

          {inChat && messages.length === 0 && (
            <p style={styles.empty}>No messages yet — send one below.</p>
          )}

          {messages.length > 0 && (
            <div ref={threadRef} style={styles.thread}>
              {messages.map((m) => (
                <div
                  key={String(m.id)}
                  style={{
                    ...styles.bubble,
                    alignSelf: m.isMaster ? "flex-start" : "flex-end",
                    background: m.isMaster ? "rgba(30, 58, 95, 0.55)" : "rgba(9, 9, 11, 0.65)",
                    borderColor: m.isMaster
                      ? "rgba(125, 211, 252, 0.35)"
                      : "rgba(148, 163, 184, 0.18)",
                  }}
                >
                  <div style={styles.bubbleMeta}>
                    <span style={{ color: m.isMaster ? "#7dd3fc" : "#94a3b8", fontWeight: 600 }}>
                      {m.isMaster ? "Founder" : "You"}
                    </span>{" "}
                    <TimeAgo timestamp={m.timestamp} />
                  </div>
                  <div style={styles.bubbleText}>{m.display}</div>
                </div>
              ))}
            </div>
          )}

          {inChat && !guestCanSend && (
            <p style={styles.waiting}>
              You’ve sent 3 messages. Waiting for a founder reply before you can send more… (checks
              every few seconds)
            </p>
          )}
          {inChat && guestCanSend && !hasReplies && messages.length > 0 && (
            <p style={styles.waiting}>
              Waiting for a reply… you can send {guestLeft} more before then.
            </p>
          )}

          {(!inChat || guestCanSend) && (
          <form onSubmit={send} style={styles.form}>
            {!inChat && (
              <label style={styles.label}>
                Your name or contact <span style={styles.opt}>(optional)</span>
                <input
                  type="text"
                  value={fromLabel}
                  onChange={(e) => setFromLabel(e.target.value)}
                  maxLength={80}
                  disabled={busy}
                  placeholder="Name, email, or handle"
                  style={styles.input}
                  autoComplete="nickname"
                />
              </label>
            )}
            <label style={styles.label}>
              {inChat ? "Your reply" : "Your message"}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={MAX_GUEST_LEN}
                rows={inChat ? 2 : 3}
                disabled={busy}
                required
                placeholder={inChat ? "Type a reply…" : "What would you like to say?"}
                style={styles.textarea}
              />
            </label>
            <div style={styles.row}>
              <button type="submit" className="ice-btn-primary" disabled={busy || !content.trim()}>
                {busy ? "Sending…" : inChat ? "Send" : "Send & get link"}
              </button>
              <span style={styles.counter}>
                {inChat
                  ? `${guestLeft} left before reply · ${content.trim().length}/${MAX_GUEST_LEN}`
                  : `${content.trim().length}/${MAX_GUEST_LEN}`}
              </span>
            </div>
            {info && <p style={styles.ok}>{info}</p>}
            {err && <p style={styles.error}>{err}</p>}
          </form>
          )}
          {inChat && !guestCanSend && err && <p style={styles.error}>{err}</p>}
        </div>
      )}
    </section>
  );
}

const styles = {
  wrap: {
    marginTop: "1rem",
    borderRadius: 14,
    border: "1px solid rgba(186, 230, 253, 0.22)",
    background: "rgba(14, 16, 28, 0.55)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 28px rgba(0,0,0,0.28)",
    overflow: "hidden",
  },
  toggle: {
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    padding: "0.85rem 1rem",
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: "inherit",
    textAlign: "left",
  },
  toggleTitle: {
    fontSize: "0.92rem",
    fontWeight: 750,
    color: "#e2e8f0",
  },
  toggleHint: {
    fontSize: "0.72rem",
    color: "#7dd3fc",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  body: {
    padding: "0 1rem 1rem",
    borderTop: "1px solid rgba(148,163,184,0.12)",
  },
  lead: {
    margin: "0.75rem 0 0.5rem",
    fontSize: "0.8rem",
    lineHeight: 1.45,
    color: "#94a3b8",
  },
  em: {
    color: "#e2e8f0",
    fontWeight: 650,
  },
  steps: {
    margin: "0 0 0.85rem",
    paddingLeft: "1.15rem",
    color: "#94a3b8",
    fontSize: "0.75rem",
    lineHeight: 1.55,
  },
  saveCard: {
    margin: "0.75rem 0 0.65rem",
    padding: "0.75rem",
    borderRadius: 12,
    border: "1px solid rgba(125, 211, 252, 0.35)",
    background: "rgba(125, 211, 252, 0.08)",
  },
  saveCardPulse: {
    boxShadow: "0 0 0 1px rgba(125, 211, 252, 0.45), 0 8px 24px rgba(56, 189, 248, 0.12)",
  },
  saveTitle: {
    fontSize: "0.82rem",
    fontWeight: 750,
    color: "#7dd3fc",
    marginBottom: "0.25rem",
  },
  saveHint: {
    margin: "0 0 0.55rem",
    fontSize: "0.72rem",
    lineHeight: 1.45,
    color: "#94a3b8",
  },
  linkRow: {
    display: "flex",
    gap: "0.4rem",
  },
  linkInput: {
    flex: 1,
    minWidth: 0,
    padding: "0.45rem 0.55rem",
    borderRadius: 8,
    border: "1px solid rgba(148,163,184,0.22)",
    background: "rgba(9,9,11,0.55)",
    color: "#cbd5e1",
    fontSize: "0.7rem",
    fontFamily: "inherit",
  },
  copyBtn: {
    flexShrink: 0,
    padding: "0.45rem 0.7rem",
    borderRadius: 8,
    border: "1px solid rgba(125,211,252,0.45)",
    background: "linear-gradient(135deg, rgba(56,189,248,0.25), rgba(129,140,248,0.22))",
    color: "#e0f2fe",
    fontWeight: 700,
    fontSize: "0.75rem",
    cursor: "pointer",
  },
  metaRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "0.45rem",
    gap: "0.5rem",
  },
  expiry: {
    fontSize: "0.72rem",
    color: "#7dd3fc",
    fontWeight: 600,
  },
  freshBtn: {
    border: "none",
    background: "transparent",
    color: "#64748b",
    fontSize: "0.7rem",
    cursor: "pointer",
    textDecoration: "underline",
    padding: 0,
  },
  empty: {
    margin: "0 0 0.5rem",
    fontSize: "0.75rem",
    color: "#64748b",
  },
  waiting: {
    margin: "0 0 0.55rem",
    fontSize: "0.72rem",
    color: "#64748b",
    fontStyle: "italic",
  },
  thread: {
    display: "flex",
    flexDirection: "column",
    gap: "0.45rem",
    maxHeight: 200,
    overflowY: "auto",
    marginBottom: "0.55rem",
    padding: "0.5rem",
    borderRadius: 10,
    background: "rgba(9,9,11,0.35)",
    border: "1px solid rgba(148,163,184,0.12)",
  },
  bubble: {
    maxWidth: "88%",
    padding: "0.45rem 0.6rem",
    borderRadius: 10,
    border: "1px solid",
  },
  bubbleMeta: {
    fontSize: "0.68rem",
    color: "#64748b",
    marginBottom: "0.15rem",
  },
  bubbleText: {
    color: "#e2e8f0",
    fontSize: "0.84rem",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  form: {
    margin: 0,
  },
  label: {
    display: "block",
    marginBottom: "0.55rem",
    fontSize: "0.72rem",
    color: "#94a3b8",
    fontWeight: 600,
  },
  opt: {
    fontWeight: 500,
    color: "#64748b",
  },
  input: {
    display: "block",
    width: "100%",
    marginTop: "0.3rem",
    boxSizing: "border-box",
    padding: "0.5rem 0.6rem",
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.22)",
    background: "rgba(9,9,11,0.55)",
    color: "#e2e8f0",
    fontSize: "0.88rem",
    fontFamily: "inherit",
  },
  textarea: {
    display: "block",
    width: "100%",
    marginTop: "0.3rem",
    boxSizing: "border-box",
    padding: "0.5rem 0.6rem",
    borderRadius: 10,
    border: "1px solid rgba(148,163,184,0.22)",
    background: "rgba(9,9,11,0.55)",
    color: "#e2e8f0",
    fontSize: "0.88rem",
    fontFamily: "inherit",
    resize: "vertical",
    minHeight: "3.2rem",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
    flexWrap: "wrap",
  },
  counter: {
    fontSize: "0.7rem",
    color: "#64748b",
  },
  ok: {
    margin: "0.55rem 0 0",
    color: "#4ade80",
    fontSize: "0.8rem",
  },
  error: {
    margin: "0.55rem 0 0",
    color: "#f87171",
    fontSize: "0.8rem",
  },
};
