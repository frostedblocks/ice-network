import React, { useEffect, useMemo, useState } from "react";
import { unwrapOpt } from "./candidUtils";
import { copyTextToClipboard } from "./copyText";
import {
  dismissWelcomeNotice,
  isWelcomeNoticeDismissed,
  publicUPath,
} from "./uProfile";

/**
 * First-run welcome after username claim / first load with zero posts.
 * Dismiss state is localStorage-only (per principal).
 */
export default function WelcomeNotice({ actor, identity }) {
  const principal = identity?.getPrincipal?.() || null;
  const principalText = (() => {
    try {
      return principal?.toText?.() || "";
    } catch {
      return "";
    }
  })();

  const [username, setUsername] = useState(null);
  const [zeroPosts, setZeroPosts] = useState(false);
  const [ready, setReady] = useState(false);
  const [copyMsg, setCopyMsg] = useState("");
  const [dismissed, setDismissed] = useState(() =>
    isWelcomeNoticeDismissed(principalText)
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!actor || !principal || dismissed) {
        setReady(true);
        return;
      }
      try {
        const raw = await actor.getProfile(principal);
        const p = unwrapOpt(raw);
        const uname = p?.username ? String(p.username) : "";
        if (!uname) {
          if (!cancelled) {
            setUsername(null);
            setZeroPosts(false);
            setReady(true);
          }
          return;
        }
        let posts = [];
        try {
          if (actor.getPostsByAuthorForViewer) {
            posts = await actor.getPostsByAuthorForViewer(principal, 1);
          } else {
            posts = await actor.getPostsByAuthor(principal, 1);
          }
        } catch {
          posts = [];
        }
        if (!cancelled) {
          setUsername(uname);
          setZeroPosts(!Array.isArray(posts) || posts.length === 0);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setUsername(null);
          setZeroPosts(false);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actor, principal, dismissed]);

  const path = useMemo(
    () => (username ? publicUPath(username) : null),
    [username]
  );
  const handle = useMemo(
    () => (username ? String(username).trim().toLowerCase() : ""),
    [username]
  );

  if (!ready || dismissed || !principalText || !username || !path || !zeroPosts) {
    return null;
  }

  const pageUrl = `https://frostedblocks.com${path}`;

  const onCopy = async () => {
    const ok = await copyTextToClipboard(pageUrl);
    setCopyMsg(ok ? "Link copied" : "Could not copy");
    setTimeout(() => setCopyMsg(""), 2000);
  };

  return (
    <div className="ice-u-notice" role="status">
      <div className="ice-u-notice-body">
        <p style={{ margin: 0 }}>
          You&apos;re in, @{handle}. Your page is live at{" "}
          <a href={path} style={{ color: "#7DD3FC" }}>
            frostedblocks.com{path}
          </a>
          . Say hello with your first post.
        </p>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.55rem",
            marginTop: "0.55rem",
            alignItems: "center",
          }}
        >
          <a href={path} className="ice-btn ice-btn-xs" style={{ textDecoration: "none" }}>
            View my page
          </a>
          <button type="button" className="ice-btn ice-btn-xs" onClick={onCopy}>
            Copy link
          </button>
          {copyMsg ? (
            <span style={{ fontSize: "0.78rem", color: "#8B9BB4" }}>{copyMsg}</span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="ice-btn ice-btn-xs"
        onClick={() => {
          dismissWelcomeNotice(principalText);
          setDismissed(true);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
