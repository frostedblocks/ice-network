import React, { useCallback, useEffect, useState } from "react";
import { unwrapOpt } from "./candidUtils";
import { copyTextToClipboard } from "./copyText";
import SafeMarkdown from "./SafeMarkdown";
import {
  isValidReturnTo,
  parseUUsername,
  publicUPath,
  setReturnTo,
  stripBioLinks,
} from "./uProfile";

const PAGE_LIMIT = 10;
const DEFAULT_DOC_TITLE = "ICE Network | Free username on the Internet Computer";

function setNoIndexMeta(on) {
  try {
    let el = document.querySelector('meta[name="robots"][data-ice-u="1"]');
    if (on) {
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("name", "robots");
        el.setAttribute("data-ice-u", "1");
        document.head.appendChild(el);
      }
      el.setAttribute("content", "noindex");
    } else if (el) {
      el.remove();
    }
  } catch {
    /* ignore */
  }
}

function formatTime(ts) {
  try {
    const n = typeof ts === "bigint" ? Number(ts) : Number(ts);
    if (!Number.isFinite(n) || n <= 0) return "";
    // Motoko timestamps are ns on IC
    const ms = n > 1e15 ? Math.floor(n / 1e6) : n;
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}

function UProfileSkeleton() {
  return (
    <div className="ice-u-skeleton" aria-busy="true" aria-live="polite">
      <span className="ice-sr-only">Loading profile…</span>
      <div className="ice-u-card">
        <div className="ice-u-hero">
          <div className="ice-u-skel ice-u-skel-avatar" />
          <div className="ice-u-hero-text" style={{ flex: 1 }}>
            <div className="ice-u-skel ice-u-skel-name" />
            <div className="ice-u-skel ice-u-skel-handle" />
            <div className="ice-u-skel ice-u-skel-bio" />
          </div>
        </div>
      </div>
      <div className="ice-u-skel-posts">
        <div className="ice-u-skel ice-u-skel-post" />
        <div className="ice-u-skel ice-u-skel-post" />
      </div>
    </div>
  );
}

/**
 * Public /u/<username> profile (path route). Works logged-out via anonymous actor.
 * Join CTA uses the same App login() path; returnTo stored in sessionStorage.
 */
export default function PublicUProfile({
  actor,
  identity,
  authClient,
  username: usernameProp,
  onJoin,
  onHome,
}) {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);

  const urlUsername =
    usernameProp || parseUUsername(window.location.pathname) || "";

  useEffect(() => {
    setNoIndexMeta(true);
    return () => {
      setNoIndexMeta(false);
      try {
        document.title = DEFAULT_DOC_TITLE;
      } catch {
        /* ignore */
      }
    };
  }, []);

  // Tab title: loading / not-found / profile
  useEffect(() => {
    try {
      if (loading) {
        document.title = "Loading… · ICE Network";
      } else if (notFound || !profile) {
        document.title = "Profile not found · ICE Network";
      } else {
        const name = String(profile.username || urlUsername || "Member").trim();
        const handle = name.toLowerCase();
        document.title = `${name} (@${handle}) · ICE Network`;
      }
    } catch {
      /* ignore */
    }
  }, [loading, notFound, profile, urlUsername]);

  const load = useCallback(async () => {
    if (!urlUsername) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    // Wait for anonymous/authenticated actor — keep skeleton up (do not flash not-found).
    if (!actor) {
      setLoading(true);
      return;
    }
    setLoading(true);
    setNotFound(false);
    setShareMsg("");
    try {
      const principalOpt = await actor.getPrincipalByUsername(urlUsername);
      const principal = unwrapOpt(principalOpt);
      if (!principal) {
        setNotFound(true);
        setProfile(null);
        setPosts([]);
        return;
      }

      // Parallel public queries only — no auth/II dependency.
      const privateP =
        typeof actor.isUserNetworkPrivate === "function"
          ? actor.isUserNetworkPrivate(principal).catch(() => false)
          : Promise.resolve(false);
      const [isPrivate, profileRaw, postsRaw] = await Promise.all([
        privateP,
        actor.getProfile(principal),
        actor.getPostsByAuthor(principal, PAGE_LIMIT),
      ]);

      if (isPrivate) {
        setNotFound(true);
        setProfile(null);
        setPosts([]);
        return;
      }

      const p = unwrapOpt(profileRaw);
      if (!p || !p.username) {
        setNotFound(true);
        setProfile(null);
        setPosts([]);
        return;
      }

      const current = String(p.username || "").trim();
      const currentKey = current.toLowerCase();
      if (currentKey && currentKey !== urlUsername.toLowerCase()) {
        const nextPath = publicUPath(currentKey);
        try {
          window.history.replaceState(null, "", nextPath);
        } catch {
          /* ignore */
        }
      }

      const list = Array.isArray(postsRaw) ? postsRaw : [];
      setProfile({ ...p, _principal: principal });
      setPosts(list);
      setHasMore(list.length >= PAGE_LIMIT);
      setNotFound(false);
    } catch (e) {
      console.error(e);
      setNotFound(true);
      setProfile(null);
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [actor, urlUsername]);

  useEffect(() => {
    load();
  }, [load]);

  // Display name keeps original casing; @handle uses normalized lowercase key.
  const displayName = profile?.username || urlUsername || "Member";
  const handleKey = String(profile?.username || urlUsername || "")
    .trim()
    .toLowerCase();
  const bioText = stripBioLinks(profile?.bio || "");
  const loggedOut = !identity || identity.getPrincipal?.()?.isAnonymous?.();
  // Join CTA waits for AuthClient so login() can run (derivationOrigin unchanged).
  const joinReady = !!authClient;

  const handleShare = async () => {
    const path = publicUPath(handleKey || urlUsername);
    const url = `https://frostedblocks.com${path}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${displayName} on ICE`, url });
        return;
      }
    } catch {
      /* fall through to copy */
    }
    const ok = await copyTextToClipboard(url);
    setShareMsg(ok ? "Link copied" : "Could not copy link");
    setTimeout(() => setShareMsg(""), 2000);
  };

  const handleJoin = () => {
    const path = publicUPath(handleKey || urlUsername);
    if (isValidReturnTo(path)) setReturnTo(path);
    if (typeof onJoin === "function") onJoin();
  };

  const loadMore = async () => {
    if (!actor || !profile?._principal || loadMoreBusy) return;
    setLoadMoreBusy(true);
    try {
      // Server caps at 20; request full window and replace
      const more = await actor.getPostsByAuthor(profile._principal, 20);
      const list = Array.isArray(more) ? more : [];
      setPosts(list);
      setHasMore(false);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadMoreBusy(false);
    }
  };

  return (
    <div className="ice-app ice-u-page">
      <div className="ice-app-orbs" aria-hidden="true">
        <span className="o1" />
        <span className="o2" />
        <span className="o3" />
      </div>
      <div className="ice-app-inner ice-u-inner">
        <header className="ice-u-header-bar">
          <button type="button" className="ice-brand-mark" onClick={onHome} aria-label="ICE home">
            ICE
          </button>
          <a
            href="/"
            className="ice-u-home-link"
            onClick={(e) => {
              e.preventDefault();
              onHome?.();
            }}
          >
            Network
          </a>
        </header>

        {loading ? (
          <UProfileSkeleton />
        ) : notFound ? (
          <div className="ice-u-card ice-u-notfound">
            <h1 className="ice-title" style={{ marginTop: 0 }}>
              Profile not found
            </h1>
            <p style={{ color: "#8B9BB4", lineHeight: 1.55 }}>
              This username is not available on ICE, or the account is not publicly listed.
            </p>
            {loggedOut && (
              <div className="ice-u-cta ice-u-cta-inline">
                <p style={{ margin: "0 0 0.65rem", color: "#EAF6FF", fontWeight: 600 }}>
                  Join ICE: free username in about a minute
                </p>
                <button
                  type="button"
                  className="ice-btn-primary"
                  onClick={handleJoin}
                  disabled={!joinReady}
                >
                  Create my free username
                </button>
                <p className="ice-u-cta-sub">Secure sign-in via Internet Identity</p>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="ice-u-card">
              <div className="ice-u-hero">
                <div className="ice-u-avatar" aria-hidden="true">
                  {displayName[0]?.toUpperCase() || "?"}
                </div>
                <div className="ice-u-hero-text">
                  <h1 className="ice-u-name">{displayName}</h1>
                  <p className="ice-u-handle">@{handleKey}</p>
                  {bioText ? <p className="ice-u-bio">{bioText}</p> : null}
                </div>
                <button type="button" className="ice-btn ice-u-share" onClick={handleShare}>
                  Share
                </button>
              </div>
              {shareMsg ? (
                <p style={{ color: "#7DD3FC", fontSize: "0.85rem", margin: "0.5rem 0 0" }}>
                  {shareMsg}
                </p>
              ) : null}
            </div>

            <section className="ice-u-posts" aria-label="Posts">
              <h2 className="ice-u-posts-title">Posts</h2>
              {posts.length === 0 ? (
                <p style={{ color: "#8B9BB4" }}>No posts yet.</p>
              ) : (
                <ul className="ice-u-post-list">
                  {posts.map((post) => (
                    <li key={String(post.id)} className="ice-u-post">
                      <SafeMarkdown body={post.content || ""} className="ice-u-post-body" />
                      <time className="ice-u-post-time" dateTime={String(post.timestamp || "")}>
                        {formatTime(post.timestamp)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
              {hasMore ? (
                <button
                  type="button"
                  className="ice-btn"
                  disabled={loadMoreBusy}
                  onClick={loadMore}
                  style={{ marginTop: "0.75rem" }}
                >
                  {loadMoreBusy ? "Loading…" : "Load more"}
                </button>
              ) : null}
            </section>
          </>
        )}
      </div>

      {!loading && !notFound && loggedOut && profile ? (
        <div className="ice-u-cta ice-u-cta-sticky">
          <p className="ice-u-cta-title">
            Join {displayName} on ICE: free username in about a minute
          </p>
          <button
            type="button"
            className="ice-btn-primary"
            onClick={handleJoin}
            disabled={!joinReady}
          >
            Create my free username
          </button>
          <p className="ice-u-cta-sub">Secure sign-in via Internet Identity</p>
        </div>
      ) : null}
    </div>
  );
}
