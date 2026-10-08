import React, { useMemo, useState } from "react";
import { unwrapOpt } from "./candidUtils";
import {
  dismissPublicProfileNotice,
  isPublicProfileNoticeDismissed,
  publicUPath,
} from "./uProfile";

/**
 * One-time notice for existing members after public /u/ pages ship.
 */
export default function PublicProfileNotice({ actor, identity }) {
  const principal = identity?.getPrincipal?.() || null;
  const principalText = (() => {
    try {
      return principal?.toText?.() || "";
    } catch {
      return "";
    }
  })();

  const [username, setUsername] = useState(null);
  const [hasPosts, setHasPosts] = useState(false);
  const [showExplainer, setShowExplainer] = useState(false);
  const [dismissed, setDismissed] = useState(() =>
    isPublicProfileNoticeDismissed(principalText)
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!actor || !principal || dismissed) return;
      try {
        const raw = await actor.getProfile(principal);
        const p = unwrapOpt(raw);
        if (!p?.username) return;
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
          setUsername(String(p.username));
          // Zero-post first-run is handled by WelcomeNotice.
          setHasPosts(Array.isArray(posts) && posts.length > 0);
        }
      } catch {
        /* ignore */
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

  if (dismissed || !principalText || !username || !path || !hasPosts) return null;

  return (
    <div className="ice-u-notice" role="status">
      <div className="ice-u-notice-body">
        <p style={{ margin: 0 }}>
          Your profile now has a public page at{" "}
          <a href={path} style={{ color: "#7DD3FC" }}>
            frostedblocks.com{path}
          </a>
          .
        </p>
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.82rem", color: "#8B9BB4" }}>
          Anyone with the link can view your username, bio, and posts.{" "}
          <button
            type="button"
            className="ice-u-notice-linkbtn"
            onClick={() => setShowExplainer((v) => !v)}
          >
            How public profiles work
          </button>
        </p>
        {showExplainer ? (
          <div className="ice-u-explainer">
            <p>
              Your page is at a stable URL under /u/. Renaming keeps old links resolving to you.
              Pages are noindex for now (not added to search engines) until a visibility setting
              ships. There is no per-profile hide toggle yet.
            </p>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="ice-btn ice-btn-xs"
        onClick={() => {
          dismissPublicProfileNotice(principalText);
          setDismissed(true);
        }}
      >
        Got it
      </button>
    </div>
  );
}
