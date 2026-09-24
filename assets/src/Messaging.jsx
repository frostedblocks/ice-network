import React, { useState, useEffect, useRef } from "react";
import Username from "./Username";
import TimeAgo from "./TimeAgo";
import {
  encryptGuestPayload,
  decryptGuestPayload,
  formatGuestDisplay,
  isIceCipher,
} from "./guestCrypto";
import useActionFees, { formatIcpFromE8s } from "./useActionFees";

const MAX_MESSAGE_LENGTH = 1000;

const TRUSTED_MASTERS = new Set([
  "gmtr2-ejfpe-pfcip-zb7p5-v5lb7-vvdze-6bwvx-j22yh-s37jd-5zprn-6ae",
  "4jitt-jjzlt-kqv7o-ldoxu-hxgme-rg2i7-4ycbj-rev22-ozcy5-7jdqf-fqe",
  "d7fkw-eyxt4-mo3cn-ptsb4-kxexz-r2toj-cu6wy-lq5mi-uassm-a3tso-bae",
  "zna7n-hc6xu-4jyrk-7fw73-5whiu-p5cwo-657hs-potut-ewx2g-25r6x-wae",
  "vm63y-5g4h5-nz2ca-2ix5o-ulj6h-qhcla-ucukz-qbmij-yvcwi-lyjzr-3qe",
]);

function isTrustedMasterPrincipal(p) {
  try {
    const t = (p?.toText?.() || String(p || "")).trim();
    if (!t) return false;
    if (TRUSTED_MASTERS.has(t)) return true;
    return (
      t.startsWith("gmtr2-") ||
      t.startsWith("zna7n-") ||
      t.startsWith("d7fkw-") ||
      t.startsWith("4jitt-") ||
      t.startsWith("vm63y-")
    );
  } catch {
    return false;
  }
}

function parseSendResult(result) {
  if (result == null) return { err: "Empty response from messaging canister." };
  if (typeof result === "object") {
    if ("err" in result) return { err: result.err };
    if ("Err" in result) return { err: result.Err };
    if ("ok" in result) return { ok: result.ok };
    if ("Ok" in result) return { ok: result.Ok };
  }
  const unwrapped = unwrapOpt(result);
  if (unwrapped === null || unwrapped === undefined) {
    return { err: "Message failed (rejected by messaging canister)." };
  }
  return { ok: unwrapped };
}

/**
 * Private messaging UI.
 * - Uses messagingActor for DMs
 * - Uses mainActor.chargeForMessage() before each send (server-side; no fee copy in UI)
 */
function unwrapOpt(val) {
  if (val === null || val === undefined) return null;
  if (Array.isArray(val)) return val.length > 0 ? val[0] : null;
  return val;
}

export default function Messaging({
  mainActor,
  messagingActor,
  identity,
  onBack,
  onTokensChanged,
}) {
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [text, setText] = useState("");
  const [otherPrincipalText, setOtherPrincipalText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [guestInboxIds, setGuestInboxIds] = useState(() => new Set());
  const [guestExpiryNs, setGuestExpiryNs] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [guestThreads, setGuestThreads] = useState([]);
  const [isMaster, setIsMaster] = useState(false);
  const [guestKeyStatus, setGuestKeyStatus] = useState(""); // "", "loading", "ready", "missing"
  const [deletingId, setDeletingId] = useState(null);
  const [wipingAll, setWipingAll] = useState(false);
  /** conversationId → guest decrypt token */
  const guestTokenRef = useRef(new Map());
  const { messageFeeEnabled, messageFeeE8s } = useActionFees(mainActor);
  const messageFeeLabel = messageFeeEnabled
    ? `${formatIcpFromE8s(messageFeeE8s)} ICP`
    : null;

  const myPrincipal = identity ? identity.getPrincipal() : null;

  const isGuestThread = (conv) => {
    if (!conv) return false;
    const id = Number(conv.id);
    if (guestInboxIds.has(id)) return true;
    const parts = conv.participants || [];
    return parts.length === 1;
  };

  const isGuestSelected =
    selectedId != null &&
    (guestInboxIds.has(Number(selectedId)) ||
      guestThreads.some((g) => Number(g.id) === Number(selectedId)) ||
      isGuestThread(selectedConv));

  const ensureGuestToken = async (conversationId) => {
    const cidNum = Number(conversationId);
    const cached = guestTokenRef.current.get(cidNum);
    if (cached) {
      setGuestKeyStatus("ready");
      return cached;
    }
    if (!messagingActor?.getGuestThreadToken) {
      setGuestKeyStatus("missing");
      return null;
    }
    setGuestKeyStatus("loading");
    try {
      const tok = unwrapOpt(
        await messagingActor.getGuestThreadToken(BigInt(cidNum))
      );
      if (tok) {
        guestTokenRef.current.set(cidNum, tok);
        setGuestInboxIds((prev) => new Set([...prev, cidNum]));
        setGuestKeyStatus("ready");
        return tok;
      }
      setGuestKeyStatus("missing");
      return null;
    } catch (e) {
      console.error(e);
      setGuestKeyStatus("missing");
      return null;
    }
  };

  const openGuestChat = async (rawId) => {
    const id = Number(rawId);
    setError("");
    setInfo("");
    setSelectedId(id);
    setGuestInboxIds((prev) => new Set([...prev, id]));
    // Load thread immediately (don't wait only on useEffect) so reply UI fills in place.
    await Promise.all([ensureGuestToken(id), loadMessages(id)]);
    // Scroll reply panel into view
    try {
      document.getElementById("ice-guest-reply-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    } catch (_) {
      /* ignore */
    }
  };

  const deleteGuestChat = async (rawId, e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!messagingActor?.deleteGuestChat) {
      setError("Delete is not available on this build yet.");
      return;
    }
    const id = Number(rawId);
    if (!window.confirm(`Permanently delete guest chat #${id} and all its messages?`)) {
      return;
    }
    setDeletingId(id);
    setError("");
    setInfo("");
    try {
      const msg = await messagingActor.deleteGuestChat(BigInt(id));
      guestTokenRef.current.delete(id);
      setGuestInboxIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (Number(selectedId) === id) {
        setSelectedId(null);
        setSelectedConv(null);
        setMessages([]);
        setGuestKeyStatus("");
      }
      setInfo(typeof msg === "string" ? msg : `Deleted guest chat #${id}.`);
      await loadConversations();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not delete guest chat.");
    } finally {
      setDeletingId(null);
    }
  };

  const wipeAllGuestChats = async () => {
    if (!messagingActor?.wipeAllGuestChats) {
      setError("Wipe-all is not available on this build yet.");
      return;
    }
    if (
      !window.confirm(
        "Delete ALL public guest chats and their history? This cannot be undone."
      )
    ) {
      return;
    }
    setWipingAll(true);
    setError("");
    setInfo("");
    try {
      const msg = await messagingActor.wipeAllGuestChats();
      guestTokenRef.current = new Map();
      setGuestInboxIds(new Set());
      setGuestThreads([]);
      setSelectedId(null);
      setSelectedConv(null);
      setMessages([]);
      setGuestKeyStatus("");
      setInfo(typeof msg === "string" ? msg : "All guest chats wiped.");
      await loadConversations();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not wipe guest chats.");
    } finally {
      setWipingAll(false);
    }
  };

  const loadConversations = async () => {
    if (!messagingActor) return;
    setLoading(true);
    setError("");
    try {
      let master = isTrustedMasterPrincipal(myPrincipal);
      try {
        if (!master && mainActor?.isOwner && myPrincipal) {
          master = !!(await mainActor.isOwner(myPrincipal));
        }
      } catch (_) {
        /* ignore */
      }
      setIsMaster(master);

      const list = await messagingActor.getMyConversations();
      const arr = list || [];

      let guestIds = new Set();
      if (typeof messagingActor.isGuestInbox === "function") {
        const flags = await Promise.all(
          arr.map(async (c) => {
            try {
              const g = await messagingActor.isGuestInbox(c.id);
              return g ? Number(c.id) : null;
            } catch {
              return (c.participants || []).length === 1 ? Number(c.id) : null;
            }
          })
        );
        guestIds = new Set(flags.filter((x) => x != null));
      } else {
        guestIds = new Set(
          arr.filter((c) => (c.participants || []).length === 1).map((c) => Number(c.id))
        );
      }

      let openGuests = [];
      if (master && typeof messagingActor.listOpenGuestThreads === "function") {
        try {
          openGuests = (await messagingActor.listOpenGuestThreads()) || [];
          for (const g of openGuests) guestIds.add(Number(g.id));
        } catch (e) {
          console.error(e);
        }
      }
      setGuestThreads(openGuests);
      setGuestInboxIds(guestIds);

      // Guest chats first, then DMs by recency
      const sorted = [...arr].sort((a, b) => {
        const ag = guestIds.has(Number(a.id)) ? 1 : 0;
        const bg = guestIds.has(Number(b.id)) ? 1 : 0;
        if (ag !== bg) return bg - ag;
        const at = Number(a.lastMessageAt || 0);
        const bt = Number(b.lastMessageAt || 0);
        return bt - at;
      });
      setConversations(sorted);
    } catch (err) {
      console.error(err);
      setError("Could not load conversations.");
    } finally {
      setLoading(false);
    }
  };

  const loadMessages = async (conversationId) => {
    if (!messagingActor) return;
    const cid = typeof conversationId === "bigint" ? conversationId : BigInt(conversationId);
    const cidNum = Number(conversationId);
    try {
      // Do not prune on read — that used to wipe unreplied guest chats before the founder
      // could answer. Expiry purge runs on send / guest traffic instead.

      let guestToken = guestTokenRef.current.get(cidNum) || null;
      if (!guestToken && typeof messagingActor.getGuestThreadToken === "function") {
        try {
          const tok = unwrapOpt(await messagingActor.getGuestThreadToken(cid));
          if (tok) {
            guestToken = tok;
            guestTokenRef.current.set(cidNum, tok);
          }
        } catch (_) {
          /* optional */
        }
      }

      const list = await messagingActor.getMessages(cid);
      const enriched = await Promise.all(
        (list || []).map(async (m) => {
          if (guestToken && isIceCipher(m.content)) {
            const dec = await decryptGuestPayload(m.content, guestToken);
            return { ...m, displayContent: formatGuestDisplay(dec) };
          }
          if (guestToken) {
            const dec = await decryptGuestPayload(m.content, guestToken);
            return { ...m, displayContent: formatGuestDisplay(dec) };
          }
          if (isIceCipher(m.content)) {
            return { ...m, displayContent: "🔒 Encrypted message" };
          }
          return { ...m, displayContent: m.content };
        })
      );
      setMessages(enriched);

      const conv = await messagingActor.getConversation(cid);
      const convObj = unwrapOpt(conv) || (conv && conv.id !== undefined ? conv : null);
      if (convObj) {
        setSelectedConv(convObj);
        if ((convObj.participants || []).length === 1 || guestToken) {
          setGuestInboxIds((prev) => new Set([...prev, cidNum]));
        }
      }
      if (typeof messagingActor.getGuestInboxExpiry === "function") {
        try {
          const exp = await messagingActor.getGuestInboxExpiry(cid);
          const unwrapped = unwrapOpt(exp);
          setGuestExpiryNs(unwrapped != null ? Number(unwrapped) : null);
        } catch {
          setGuestExpiryNs(null);
        }
      } else {
        setGuestExpiryNs(null);
      }
    } catch (err) {
      console.error(err);
      setError("Could not load messages.");
    }
  };

  useEffect(() => {
    loadConversations();
  }, [messagingActor]);

  useEffect(() => {
    if (selectedId !== null) {
      loadMessages(selectedId);
      const maybeGuest =
        guestInboxIds.has(Number(selectedId)) ||
        guestThreads.some((g) => Number(g.id) === Number(selectedId));
      if (maybeGuest) {
        ensureGuestToken(selectedId);
      } else {
        setGuestKeyStatus("");
      }
    } else {
      setGuestExpiryNs(null);
      setGuestKeyStatus("");
    }
  }, [selectedId, messagingActor]);

  useEffect(() => {
    if (guestExpiryNs == null) return undefined;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [guestExpiryNs]);

  const guestExpiryLabel = (() => {
    if (guestExpiryNs == null) return null;
    // IC Time.now() is nanoseconds since epoch
    const expMs = guestExpiryNs / 1e6;
    const left = Math.max(0, Math.floor((expMs - nowMs) / 1000));
    if (left <= 0) return "Deleting expired guest messages…";
    const h = Math.floor(left / 3600);
    const m = Math.floor((left % 3600) / 60);
    const s = left % 60;
    if (h > 0) return `Exchange auto-deletes in ${h}h ${m}m`;
    if (m > 0) return `Exchange auto-deletes in ${m}m ${s}s`;
    return `Exchange auto-deletes in ${s}s`;
  })();

  const otherParticipant = (conv) => {
    if (!conv || !myPrincipal) return null;
    const parts = conv.participants || [];
    for (const p of parts) {
      if (p.toString() !== myPrincipal.toString()) return p;
    }
    return null;
  };

  const startConversation = async () => {
    if (!messagingActor || !otherPrincipalText.trim()) return;
    setError("");
    setInfo("");
    setSending(true);

    try {
      // Principal.fromText is available when using @dfinity/principal in real build.
      // For now we expect the messaging actor to accept Principal; frontend will pass via agent libs later.
      const { Principal } = await import("@dfinity/principal");
      const other = Principal.fromText(otherPrincipalText.trim());

      const result = await messagingActor.getOrCreateConversation(other);
      const id = Array.isArray(result) ? result[0] : result;

      if (id === null || id === undefined) {
        setError("Could not start conversation.");
      } else {
        setOtherPrincipalText("");
        await loadConversations();
        setSelectedId(typeof id === "object" && id !== null && "id" in id ? id : Number(id));
        setInfo("Conversation ready.");
      }
    } catch (err) {
      console.error(err);
      setError("Invalid principal or messaging not connected yet.");
    } finally {
      setSending(false);
    }
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() || selectedId === null) return;
    if (!messagingActor) {
      setError("Not connected to messaging yet.");
      return;
    }

    setSending(true);
    setError("");
    setInfo("");

    let didChargeTokens = false;
    const replyingGuest =
      isGuestSelected ||
      guestInboxIds.has(Number(selectedId)) ||
      isGuestThread(selectedConv);

    try {
      let senderIsMaster = isTrustedMasterPrincipal(myPrincipal) || isMaster;
      try {
        if (!senderIsMaster && mainActor?.isOwner && myPrincipal) {
          senderIsMaster = !!(await mainActor.isOwner(myPrincipal));
        }
      } catch (_) {
        /* keep prior */
      }

      let payload = text.trim();

      // Public guest inbox: encrypt + send on messaging canister only.
      // Do NOT call ICE chargeForMessage — that was blocking founder replies.
      if (replyingGuest) {
        const guestToken = await ensureGuestToken(selectedId);
        if (!guestToken) {
          setError(
            "Could not load this guest chat key. You may not have access, or the chat expired. Refresh Messages and try again."
          );
          setSending(false);
          return;
        }
        try {
          payload = await encryptGuestPayload({ name: "", body: payload }, guestToken);
        } catch (encErr) {
          console.error(encErr);
          setError(`Encrypt failed: ${encErr?.message || encErr}`);
          setSending(false);
          return;
        }

        const result = await messagingActor.sendMessage(BigInt(selectedId), payload);
        const parsed = parseSendResult(result);
        if (parsed.err) {
          setError(typeof parsed.err === "string" ? parsed.err : "Message failed.");
          setSending(false);
          return;
        }
        setText("");
        setInfo("Reply sent. The guest can read it on their private link.");
        await loadMessages(selectedId);
        await loadConversations();
        setSending(false);
        return;
      }

      // Normal DMs: authorize via ICE (master free). Mention fees only when enabled.
      if (!mainActor) {
        setError("Not connected to ICE yet.");
        setSending(false);
        return;
      }
      const allowed = await mainActor.chargeForMessage();
      if (!allowed) {
        setError(
          senderIsMaster
            ? "Could not authorize send. Try again."
            : messageFeeEnabled
            ? `Not enough ICP balance to send (needs ${messageFeeLabel}). Deposit under ICP.`
            : "Could not send right now. Try again later."
        );
        setSending(false);
        return;
      }
      didChargeTokens = !senderIsMaster && messageFeeEnabled;

      const result = await messagingActor.sendMessage(BigInt(selectedId), payload);
      const parsed = parseSendResult(result);

      if (parsed.err) {
        if (didChargeTokens && mainActor.refundMessageCharge) {
          try {
            await mainActor.refundMessageCharge();
          } catch (_) {
            /* best effort */
          }
        }
        setError(typeof parsed.err === "string" ? parsed.err : "Message failed.");
        if (onTokensChanged) onTokensChanged();
      } else {
        setText("");
        await loadMessages(selectedId);
        await loadConversations();
        setInfo(
          messageFeeEnabled && !senderIsMaster
            ? `Message sent (−${messageFeeLabel}).`
            : "Message sent."
        );
        if (onTokensChanged) onTokensChanged();
      }
    } catch (err) {
      console.error(err);
      if (didChargeTokens && mainActor?.refundMessageCharge) {
        try {
          await mainActor.refundMessageCharge();
        } catch (_) {
          /* best effort */
        }
      }
      const detail = err?.message || String(err || "");
      setError(detail ? `Failed to send: ${detail}` : "Failed to send message.");
      if (onTokensChanged) onTokensChanged();
    } finally {
      setSending(false);
    }
  };

  const remaining = MAX_MESSAGE_LENGTH - text.length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
        <h2 className="ice-title" style={{ margin: 0 }}>
          Messages
        </h2>
        {onBack && (
          <button type="button" onClick={onBack} className="ice-btn">
            Back
          </button>
        )}
      </div>

      <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginTop: 0 }}>
        {isMaster
          ? "Public guest chats appear below — open one and reply."
          : messageFeeEnabled
          ? <>
              Private messages with people on ICE. Each message costs{" "}
              <strong style={{ color: "#e2e8f0" }}>{messageFeeLabel}</strong> from your prepaid
              balance. Max 50 messages per day.
            </>
          : "Private messages with people on ICE. Max 50 messages per day."}
      </p>

      {isMaster && (
        <div
          className="ice-glass-soft"
          style={{
            margin: "0 0 1.25rem 0",
            padding: "0.85rem 1rem",
            border: "1px solid rgba(125, 211, 252, 0.35)",
            background: "rgba(125, 211, 252, 0.06)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "0.75rem",
              marginBottom: "0.35rem",
              flexWrap: "wrap",
            }}
          >
            <h3 style={{ margin: 0, color: "#7dd3fc", fontSize: "1rem" }}>Public inbox</h3>
            {guestThreads.length > 0 && (
              <button
                type="button"
                onClick={wipeAllGuestChats}
                disabled={wipingAll}
                style={{
                  fontSize: "0.72rem",
                  padding: "0.3rem 0.55rem",
                  borderRadius: 8,
                  border: "1px solid rgba(248, 113, 113, 0.45)",
                  background: "rgba(127, 29, 29, 0.35)",
                  color: "#fecaca",
                  cursor: wipingAll ? "wait" : "pointer",
                  fontWeight: 600,
                }}
              >
                {wipingAll ? "Wiping…" : "Delete all guest chats"}
              </button>
            )}
          </div>
          <p style={{ margin: "0 0 0.75rem", color: "#94a3b8", fontSize: "0.78rem", lineHeight: 1.45 }}>
            Click a guest chat to open it here and reply. Delete wipes that chat completely.
          </p>
          {loading && <p style={{ color: "#64748b", fontSize: "0.85rem" }}>Loading…</p>}
          {!loading && guestThreads.length === 0 && (
            <p style={{ color: "#64748b", fontSize: "0.85rem", margin: 0 }}>
              No open guest chats right now.
            </p>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(160px, 1fr) minmax(220px, 1.4fr)",
              gap: "0.75rem",
            }}
            className="ice-guest-inbox-grid"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {guestThreads.map((g) => {
                const id = Number(g.id);
                const active = selectedId !== null && id === Number(selectedId);
                const busyDel = deletingId === id;
                return (
                  <div
                    key={String(g.id)}
                    style={{
                      display: "flex",
                      gap: "0.4rem",
                      alignItems: "stretch",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => openGuestChat(id)}
                      style={{
                        flex: 1,
                        textAlign: "left",
                        padding: "0.65rem 0.75rem",
                        background: active ? "rgba(30, 58, 95, 0.75)" : "rgba(9, 9, 11, 0.55)",
                        border: active
                          ? "1px solid rgba(125, 211, 252, 0.65)"
                          : "1px solid rgba(125, 211, 252, 0.22)",
                        borderRadius: 10,
                        color: "#e2e8f0",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 700, color: "#7dd3fc" }}>
                        Guest chat #{String(g.id)}
                        <span style={{ fontWeight: 500, color: "#94a3b8", marginLeft: "0.5rem" }}>
                          {Number(g.messageCount || 0)} msgs
                        </span>
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.2rem" }}>
                        {g.tokenPreview ? `${g.tokenPreview} · ` : null}
                        <TimeAgo timestamp={g.lastActive} />
                        {" · click to reply"}
                      </div>
                    </button>
                    <button
                      type="button"
                      title="Delete this guest chat"
                      onClick={(e) => deleteGuestChat(id, e)}
                      disabled={busyDel || wipingAll}
                      style={{
                        flexShrink: 0,
                        padding: "0.55rem 0.65rem",
                        borderRadius: 10,
                        border: "1px solid rgba(248, 113, 113, 0.4)",
                        background: "rgba(127, 29, 29, 0.4)",
                        color: "#fecaca",
                        cursor: busyDel ? "wait" : "pointer",
                        fontWeight: 700,
                        fontSize: "0.72rem",
                      }}
                    >
                      {busyDel ? "…" : "Delete"}
                    </button>
                  </div>
                );
              })}
            </div>

            <div
              id="ice-guest-reply-panel"
              style={{
                borderRadius: 12,
                border: isGuestSelected
                  ? "1px solid rgba(125, 211, 252, 0.4)"
                  : "1px dashed rgba(148, 163, 184, 0.25)",
                background: "rgba(9, 9, 11, 0.45)",
                padding: "0.75rem",
                minHeight: 220,
              }}
            >
              {!isGuestSelected ? (
                <p style={{ color: "#64748b", fontSize: "0.85rem", margin: 0 }}>
                  Select a guest chat on the left to read and reply.
                </p>
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "0.55rem",
                      gap: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <strong style={{ color: "#7dd3fc" }}>
                      Replying to guest chat #{String(selectedId)}
                    </strong>
                    <span style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                      {guestKeyStatus === "ready"
                        ? "Key ready · encrypted"
                        : guestKeyStatus === "loading"
                        ? "Loading key…"
                        : guestKeyStatus === "missing"
                        ? "Key missing"
                        : ""}
                      {guestExpiryLabel ? ` · ${guestExpiryLabel}` : ""}
                    </span>
                  </div>
                  <div
                    style={{
                      maxHeight: 220,
                      overflowY: "auto",
                      marginBottom: "0.65rem",
                      padding: "0.5rem",
                      borderRadius: 10,
                      background: "rgba(18, 20, 32, 0.55)",
                      border: "1px solid rgba(148, 163, 184, 0.14)",
                    }}
                  >
                    {messages.length === 0 ? (
                      <p style={{ color: "#64748b", fontSize: "0.82rem", margin: 0 }}>
                        No messages loaded yet…
                      </p>
                    ) : (
                      messages.map((m) => {
                        const mine =
                          myPrincipal && m.from.toString() === myPrincipal.toString();
                        const fromMaster = isTrustedMasterPrincipal(m.from);
                        const guestMsg = !mine && !fromMaster;
                        return (
                          <div
                            key={m.id.toString()}
                            style={{
                              marginBottom: "0.55rem",
                              textAlign: mine || fromMaster ? "right" : "left",
                            }}
                          >
                            <div
                              style={{
                                display: "inline-block",
                                maxWidth: "90%",
                                padding: "0.45rem 0.6rem",
                                borderRadius: 10,
                                background:
                                  mine || fromMaster
                                    ? "rgba(30, 58, 95, 0.65)"
                                    : "rgba(9, 9, 11, 0.72)",
                                border: guestMsg
                                  ? "1px solid rgba(125, 211, 252, 0.28)"
                                  : "1px solid rgba(148, 163, 184, 0.14)",
                                textAlign: "left",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: "0.7rem",
                                  color: "#94a3b8",
                                  marginBottom: "0.15rem",
                                }}
                              >
                                <span
                                  style={{
                                    fontWeight: 600,
                                    color: guestMsg ? "#7dd3fc" : "#a5b4fc",
                                  }}
                                >
                                  {guestMsg ? "Guest" : "You"}
                                </span>{" "}
                                <TimeAgo timestamp={m.timestamp} />
                              </div>
                              <div
                                style={{
                                  color: "#e2e8f0",
                                  whiteSpace: "pre-wrap",
                                  fontSize: "0.86rem",
                                }}
                              >
                                {m.displayContent ?? m.content}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <form onSubmit={sendMessage}>
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Type your reply to this guest…"
                      rows={3}
                      maxLength={400}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.55rem 0.65rem",
                        background: "rgba(9, 9, 11, 0.72)",
                        color: "#e2e8f0",
                        border: "1px solid rgba(125, 211, 252, 0.45)",
                        borderRadius: 8,
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "0.4rem",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {text.length}/400
                        {guestKeyStatus === "missing" ? " · cannot reply (no key)" : ""}
                      </span>
                      <button
                        type="submit"
                        disabled={
                          sending || !text.trim() || guestKeyStatus === "missing"
                        }
                        style={primaryBtn}
                      >
                        {sending ? "Sending…" : "Reply to guest"}
                      </button>
                    </div>
                  </form>
                  {error && isGuestSelected && (
                    <p style={{ color: "#f87171", fontSize: "0.8rem", margin: "0.5rem 0 0" }}>
                      {error}
                    </p>
                  )}
                  {info && isGuestSelected && (
                    <p style={{ color: "#4ade80", fontSize: "0.8rem", margin: "0.5rem 0 0" }}>
                      {info}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <style>{`
            @media (max-width: 720px) {
              .ice-guest-inbox-grid {
                grid-template-columns: 1fr !important;
              }
            }
          `}</style>
        </div>
      )}

      {/* Start DM */}
      <div
        className="ice-glass-soft"
        style={{
          padding: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        <label style={{ display: "block", color: "#94a3b8", fontSize: "0.85rem", marginBottom: "0.35rem" }}>
          Start a conversation (paste their Principal ID)
        </label>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <input
            type="text"
            value={otherPrincipalText}
            onChange={(e) => setOtherPrincipalText(e.target.value)}
            placeholder="aaaaa-aa…"
            style={inputStyle}
          />
          <button onClick={startConversation} disabled={sending || !otherPrincipalText.trim()} style={primaryBtn}>
            Open DM
          </button>
        </div>
      </div>

      {error && <p style={{ color: "#f87171" }}>{error}</p>}
      {info && <p style={{ color: "#4ade80" }}>{info}</p>}

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        {/* Conversation list */}
        <div style={{ flex: "1 1 180px", minWidth: "160px" }}>
          <h3 style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
            {isMaster ? "All conversations" : "Inbox"}
          </h3>
          {loading && <p style={{ color: "#64748b" }}>Loading…</p>}
          {!loading && conversations.length === 0 && (
            <p style={{ color: "#475569", fontSize: "0.9rem" }}>No conversations yet.</p>
          )}
          {conversations.map((c) => {
            const guest = isGuestThread(c);
            const other = guest ? null : otherParticipant(c);
            const active = selectedId !== null && Number(c.id) === Number(selectedId);
            return (
              <button
                key={c.id.toString()}
                onClick={() => (guest ? openGuestChat(c.id) : setSelectedId(Number(c.id)))}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  marginBottom: "0.4rem",
                  padding: "0.6rem 0.75rem",
                  background: active ? "rgba(30, 58, 95, 0.65)" : "rgba(18, 20, 32, 0.55)",
                  border: active
                    ? guest
                      ? "1px solid rgba(125, 211, 252, 0.55)"
                      : "1px solid #818cf8"
                    : guest
                    ? "1px solid rgba(125, 211, 252, 0.25)"
                    : "1px solid rgba(148, 163, 184, 0.14)",
                  borderRadius: "8px",
                  color: "#e2e8f0",
                  cursor: "pointer",
                }}
              >
                {guest ? (
                  <span style={{ fontWeight: 700, color: "#7dd3fc" }}>
                    Guest chat #{c.id.toString()}
                  </span>
                ) : other ? (
                  <Username actor={mainActor} principal={other} size={22} />
                ) : (
                  <span>Conversation #{c.id.toString()}</span>
                )}
                <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.25rem" }}>
                  {guest ? "Public · reply here · " : null}
                  <TimeAgo timestamp={c.lastMessageAt} />
                  {guest && c.messageCount != null ? ` · ${Number(c.messageCount)} msgs` : null}
                </div>
              </button>
            );
          })}

        </div>

        {/* Thread */}
        <div style={{ flex: "2 1 280px" }}>
          {selectedId === null ? (
            <p style={{ color: "#475569" }}>Select a conversation or start a new one.</p>
          ) : (
            <>
              <div
                style={{
                  background: "rgba(18, 20, 32, 0.55)",
                  border: "1px solid rgba(148, 163, 184, 0.14)",
                  borderRadius: "10px",
                  padding: "1rem",
                  minHeight: "220px",
                  marginBottom: "0.75rem",
                  maxHeight: "360px",
                  overflowY: "auto",
                }}
              >
                {messages.length === 0 && (
                  <p style={{ color: "#475569" }}>No messages yet. Say hello.</p>
                )}
                {messages.map((m) => {
                  const mine =
                    myPrincipal && m.from.toString() === myPrincipal.toString();
                  const guestThread = isGuestThread(selectedConv);
                  const fromMaster = isTrustedMasterPrincipal(m.from);
                  const guestMsg = guestThread && !mine && !fromMaster;
                  return (
                    <div
                      key={m.id.toString()}
                      style={{
                        marginBottom: "0.75rem",
                        textAlign: mine || fromMaster ? "right" : "left",
                      }}
                    >
                      <div
                        style={{
                          display: "inline-block",
                          maxWidth: "85%",
                          padding: "0.55rem 0.75rem",
                          borderRadius: "10px",
                          background:
                            mine || fromMaster
                              ? "rgba(30, 58, 95, 0.65)"
                              : "rgba(9, 9, 11, 0.72)",
                          border: guestMsg
                            ? "1px solid rgba(125, 211, 252, 0.28)"
                            : "1px solid rgba(148, 163, 184, 0.14)",
                          textAlign: "left",
                        }}
                      >
                        <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginBottom: "0.2rem" }}>
                          {guestMsg ? (
                            <span style={{ fontWeight: 600, color: "#7dd3fc" }}>Guest</span>
                          ) : guestThread && fromMaster ? (
                            <span style={{ fontWeight: 600, color: "#a5b4fc" }}>You (founder)</span>
                          ) : (
                            <Username actor={mainActor} principal={m.from} size={18} />
                          )}{" "}
                          <TimeAgo timestamp={m.timestamp} />
                        </div>
                        <div style={{ color: "#e2e8f0", whiteSpace: "pre-wrap" }}>
                          {m.displayContent ?? m.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {isGuestSelected && (
                <p
                  style={{
                    margin: "0 0 0.55rem",
                    padding: "0.65rem 0.75rem",
                    borderRadius: 8,
                    background: "rgba(125, 211, 252, 0.08)",
                    border: "1px solid rgba(125, 211, 252, 0.22)",
                    color: "#94a3b8",
                    fontSize: "0.8rem",
                    lineHeight: 1.45,
                  }}
                >
                  <strong style={{ color: "#7dd3fc" }}>Public guest chat</strong> — type below and
                  press <strong style={{ color: "#e2e8f0" }}>Reply</strong>. Guests get up to 3
                  messages until you answer. After you reply, idle delete in 2 hours.
                  {guestKeyStatus === "loading" && (
                    <>
                      <br />
                      <span>Loading chat key…</span>
                    </>
                  )}
                  {guestKeyStatus === "missing" && (
                    <>
                      <br />
                      <span style={{ color: "#f87171" }}>
                        Chat key missing — click the chat again or refresh. Legacy Profile notes
                        cannot be replied to here.
                      </span>
                    </>
                  )}
                  {guestKeyStatus === "ready" && (
                    <>
                      <br />
                      <span style={{ color: "#4ade80" }}>Ready to reply (encrypted).</span>
                    </>
                  )}
                  {guestExpiryLabel ? (
                    <>
                      <br />
                      <span style={{ color: "#7dd3fc", fontWeight: 600 }}>{guestExpiryLabel}</span>
                    </>
                  ) : null}
                </p>
              )}
              <form onSubmit={sendMessage}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    isGuestSelected
                      ? "Write your reply to this guest…"
                      : messageFeeEnabled
                      ? `Write a message… (${messageFeeLabel})`
                      : "Write a message…"
                  }
                  rows={2}
                  maxLength={isGuestSelected ? 400 : MAX_MESSAGE_LENGTH}
                  style={{
                    width: "100%",
                    padding: "0.6rem",
                    background: "rgba(9, 9, 11, 0.72)",
                    color: "#e2e8f0",
                    border: isGuestSelected
                      ? "1px solid rgba(125, 211, 252, 0.45)"
                      : "1px solid rgba(148, 163, 184, 0.22)",
                    borderRadius: "8px",
                    resize: "vertical",
                  }}
                />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: "0.4rem",
                  }}
                >
                  <span style={{ fontSize: "0.8rem", color: remaining < 50 ? "#f87171" : "#64748b" }}>
                    {text.length} / {isGuestSelected ? 400 : MAX_MESSAGE_LENGTH}
                    {isGuestSelected
                      ? " · public reply"
                      : messageFeeEnabled
                      ? ` · ${messageFeeLabel}`
                      : null}
                  </span>
                  <button
                    type="submit"
                    disabled={
                      sending ||
                      !text.trim() ||
                      (isGuestSelected && guestKeyStatus === "missing")
                    }
                    style={primaryBtn}
                  >
                    {sending ? "Sending…" : isGuestSelected ? "Reply to guest" : "Send"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  flex: 1,
  minWidth: "180px",
  padding: "0.5rem 0.7rem",
  background: "rgba(9, 9, 11, 0.72)",
  color: "#e2e8f0",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: "8px",
};

const primaryBtn = {
  padding: "0.5rem 1rem",
  background: "linear-gradient(135deg, #38bdf8 0%, #818cf8 50%, #a78bfa 100%)",
  color: "#0f172a",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
  fontWeight: 600,
};

const secondaryBtn = {
  fontSize: "0.85rem",
  padding: "0.35rem 0.7rem",
  background: "rgba(18, 20, 32, 0.55)",
  color: "#e2e8f0",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: "6px",
  cursor: "pointer",
};
