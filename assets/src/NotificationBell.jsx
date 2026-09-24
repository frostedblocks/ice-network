import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * Header bell: unread badge + dropdown of in-app notifications.
 * Optional browser Notification API when permission granted.
 */
const HIDDEN_KINDS = new Set(["follow", "message", "dm", "messages"]);

function isHiddenKind(kind) {
  return HIDDEN_KINDS.has(String(kind || "").toLowerCase());
}

export default function NotificationBell({ actor, enabled }) {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const prevUnread = useRef(0);
  const rootRef = useRef(null);

  const load = useCallback(async () => {
    if (!actor || !enabled) return;
    if (typeof actor.getNotifications !== "function") return;
    try {
      const list = await actor.getNotifications(30n);
      const visible = (Array.isArray(list) ? list : []).filter((n) => !isHiddenKind(n.kind));
      const visibleUnread = visible.filter((n) => !n.read).length;
      setUnread(visibleUnread);
      setItems(visible);

      // Browser push when visible unread increases and permission already granted
      if (
        visibleUnread > prevUnread.current &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        visible.length > 0
      ) {
        const newest = visible[0];
        if (newest && !newest.read && !isHiddenKind(newest.kind)) {
          try {
            new Notification("ICE", {
              body: newest.message || "New notification",
              tag: `ice-n-${String(newest.id)}`,
            });
          } catch (_) {}
        }
      }
      prevUnread.current = visibleUnread;
    } catch (e) {
      console.error(e);
    }
  }, [actor, enabled]);

  useEffect(() => {
    load();
    if (!enabled) return undefined;
    const t = setInterval(load, 25000);
    return () => clearInterval(t);
  }, [load, enabled]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const requestBrowserPush = async () => {
    if (typeof Notification === "undefined") return;
    try {
      if (Notification.permission === "default") {
        await Notification.requestPermission();
      }
    } catch (_) {}
  };

  const markAll = async () => {
    if (!actor?.markAllNotificationsRead) return;
    setBusy(true);
    try {
      await actor.markAllNotificationsRead();
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  const markOne = async (id) => {
    if (!actor?.markNotificationRead) return;
    try {
      const nid = typeof id === "bigint" ? id : BigInt(id);
      await actor.markNotificationRead(nid);
      await load();
    } catch (e) {
      console.error(e);
    }
  };

  if (!enabled) return null;

  const badge = unread > 99 ? "99+" : unread > 0 ? String(unread) : "";

  const kindIcon = (k) => {
    if (k === "post") return "✎";
    if (k === "tip") return "✦";
    if (k === "payment") return "◈";
    return "•";
  };

  const formatWhen = (ts) => {
    try {
      const ms = Number(typeof ts === "bigint" ? ts : ts) / 1_000_000;
      if (!Number.isFinite(ms) || ms <= 0) return "";
      const d = new Date(ms);
      return d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        className="ice-btn ice-notif-bell"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) {
            load();
            requestBrowserPush();
          }
        }}
        aria-label={unread > 0 ? `${unread} unread notifications` : "Notifications"}
        title="Notifications"
        style={{ position: "relative", minWidth: "2.4rem" }}
      >
        <span aria-hidden="true">🔔</span>
        {badge ? <span className="ice-notif-badge">{badge}</span> : null}
      </button>

      {open && (
        <div className="ice-notif-panel" role="dialog" aria-label="Notifications">
          <div className="ice-notif-panel-head">
            <strong>Notifications</strong>
            <div style={{ display: "flex", gap: "0.35rem" }}>
              {typeof Notification !== "undefined" && Notification.permission !== "granted" && (
                <button type="button" className="ice-btn ice-btn-xs" onClick={requestBrowserPush}>
                  Enable browser
                </button>
              )}
              <button
                type="button"
                className="ice-btn ice-btn-xs"
                disabled={busy || unread === 0}
                onClick={markAll}
              >
                Mark all read
              </button>
            </div>
          </div>
          {items.length === 0 ? (
            <p className="ice-notif-empty">No notifications yet.</p>
          ) : (
            <ul className="ice-notif-list">
              {items.map((n) => {
                const id = n.id;
                const key = typeof id === "bigint" ? id.toString() : String(id);
                return (
                  <li
                    key={key}
                    className={`ice-notif-item${n.read ? "" : " is-unread"}`}
                    onClick={() => {
                      if (!n.read) markOne(id);
                    }}
                  >
                    <span className="ice-notif-kind">{kindIcon(n.kind)}</span>
                    <div className="ice-notif-body">
                      <div className="ice-notif-msg">{n.message || n.kind}</div>
                      <div className="ice-notif-meta">
                        {n.kind}
                        {n.createdAt != null ? ` · ${formatWhen(n.createdAt)}` : ""}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
