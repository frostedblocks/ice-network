import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createAnonymousIceActor } from "./actors";
import Username from "./Username";
import TimeAgo, { activityBucket } from "./TimeAgo";
import { DEFAULT_CATEGORY, categoryStyle } from "./categories";
import LedgerAffiliateAd from "./LedgerAffiliateAd";
import BinanceUsAd from "./BinanceUsAd";


const POLL_MS = 50_000;

function excerpt(text, max = 220) {
  const t = String(text || "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const nicer = cut.replace(/\s+\S*$/, "");
  return `${nicer || cut}…`;
}

function postIdKey(id) {
  try {
    return id?.toString?.() ?? String(id);
  } catch {
    return String(id);
  }
}

function engagementScore(post) {
  return Number(post?.likes ?? 0) + Number(post?.loves ?? 0);
}

function newestPostId(list) {
  if (!list?.length) return null;
  let best = null;
  for (const p of list) {
    try {
      const n = typeof p.id === "bigint" ? p.id : BigInt(p.id);
      if (best === null || n > best) best = n;
    } catch {
      /* skip */
    }
  }
  return best;
}

function pickWorthALookIds(list, max = 2) {
  const scored = (Array.isArray(list) ? list : [])
    .map((p) => ({ id: postIdKey(p.id), score: engagementScore(p) }))
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score);
  const out = new Set();
  for (const row of scored) {
    if (out.size >= max) break;
    out.add(row.id);
  }
  return out;
}

async function loadCategories(a, arr) {
  if (!a?.getCategoriesForPosts || !arr?.length) return {};
  try {
    const pairs = await a.getCategoriesForPosts(arr.map((p) => p.id));
    const map = {};
    for (const entry of pairs || []) {
      const id = entry?.[0];
      const cat = entry?.[1];
      if (id !== undefined && id !== null) {
        map[id.toString()] = cat || DEFAULT_CATEGORY;
      }
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * Pre-login public experience: feed preview + account CTAs.
 */
export default function PublicLanding({ onJoin, onLogin, isLocal = false }) {
  const feedRef = useRef(null);
  const baselineNewestRef = useRef(null);
  const [actor, setActor] = useState(null);
  const [posts, setPosts] = useState([]);
  const [categoryMap, setCategoryMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState({});
  const [fullBody, setFullBody] = useState({});
  const [pendingPosts, setPendingPosts] = useState(null);
  const [pendingCategories, setPendingCategories] = useState(null);

  const applyFeed = useCallback((arr, cats, { setBaseline = true } = {}) => {
    const list = Array.isArray(arr) ? arr : [];
    setPosts(list);
    setCategoryMap(cats || {});
    if (setBaseline) {
      baselineNewestRef.current = newestPostId(list);
    }
    setPendingPosts(null);
    setPendingCategories(null);
  }, []);

  const fetchFeed = useCallback(async (a, { soft = false } = {}) => {
    const list = await a.getRecentPosts(40);
    const arr = Array.isArray(list) ? list : [];
    const cats = await loadCategories(a, arr);
    return { arr, cats };
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const a = actor || (await createAnonymousIceActor());
      setActor(a);
      const { arr, cats } = await fetchFeed(a);
      applyFeed(arr, cats, { setBaseline: true });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not load the public feed.");
    } finally {
      setLoading(false);
    }
  }, [actor, applyFeed, fetchFeed]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const a = await createAnonymousIceActor();
        if (cancelled) return;
        setActor(a);
        const { arr, cats } = await fetchFeed(a);
        if (cancelled) return;
        applyFeed(arr, cats, { setBaseline: true });
      } catch (err) {
        console.error(err);
        if (!cancelled) setError(err?.message || "Could not load the public feed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyFeed, fetchFeed]);

  // Soft poll for newer posts (public landing only)
  useEffect(() => {
    if (!actor) return undefined;

    let cancelled = false;

    const check = async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      try {
        const { arr, cats } = await fetchFeed(actor);
        if (cancelled) return;
        const newest = newestPostId(arr);
        const baseline = baselineNewestRef.current;
        if (newest !== null && baseline !== null && newest > baseline) {
          setPendingPosts(arr);
          setPendingCategories(cats);
        } else if (baseline === null && newest !== null) {
          baselineNewestRef.current = newest;
        }
      } catch (_) {
        /* quiet */
      }
    };

    const interval = setInterval(check, POLL_MS);
    const onVis = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [actor, fetchFeed]);

  const showNewPosts = () => {
    if (!pendingPosts) return;
    applyFeed(pendingPosts, pendingCategories || {}, { setBaseline: true });
    setExpanded({});
  };

  const worthALook = useMemo(() => pickWorthALookIds(posts, 2), [posts]);

  const exploreFeed = () => {
    const el = feedRef.current || document.getElementById("public-feed");
    if (el?.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  /** Create your account — Internet Identity, then Join/mint if new */
  const createAccount = () => {
    if (typeof onJoin === "function") onJoin();
    else if (typeof onLogin === "function") onLogin();
  };

  /** Sign in — same II login; existing members enter the app (no registry kick-out) */
  const signIn = () => {
    if (typeof onLogin === "function") onLogin();
    else if (typeof onJoin === "function") onJoin();
  };

  const loadComments = async (postId) => {
    const key = postIdKey(postId);
    if (expanded[key] !== undefined) {
      setExpanded((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }
    if (!actor) return;
    try {
      const result = await actor.getComments(postId);
      setExpanded((prev) => ({
        ...prev,
        [key]: Array.isArray(result) ? result : [],
      }));
    } catch (err) {
      console.error(err);
      setExpanded((prev) => ({ ...prev, [key]: [] }));
    }
  };

  const toggleFullBody = (id) => {
    const key = postIdKey(id);
    setFullBody((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="ice-public-page" style={styles.page}>
      <div style={styles.orbs} aria-hidden="true">
        <div style={{ ...styles.orb, ...styles.orbA }} />
        <div style={{ ...styles.orb, ...styles.orbB }} />
        <div style={{ ...styles.orb, ...styles.orbC }} />
      </div>

      <div style={styles.wrap}>
        <header className="ice-public-header" style={styles.header}>
          <div style={styles.brandRow}>
            <div style={styles.logo} aria-hidden="true">
              ICE
            </div>
            <div>
              <div style={styles.brandName}>ICE Network</div>
              <div style={styles.domain}>frostedblocks.com</div>
            </div>
          </div>
          <div style={styles.headerActions}>
            <a href="/how-to-join" style={styles.navLink}>
              How to join
            </a>
            <a href="/about" style={styles.navLink}>
              About
            </a>
            <button type="button" onClick={signIn} style={styles.loginBtn}>
              {isLocal ? "Continue (local)" : "Sign in"}
            </button>
          </div>
        </header>

        <main className="ice-public-main" style={styles.main}>
          <section className="ice-public-hero" style={styles.heroCol}>
            <div style={styles.glass}>
              <div style={styles.accentLine} />
              <p style={styles.eyebrow}>Free username on ICE</p>
              <h1 style={styles.h1}>
                <span style={styles.h1Grad}>Post on</span>
                <span style={styles.h1Sub}>ICE</span>
              </h1>
              <p style={styles.tagline}>
                Create a free username to post and browse the feed. A personal site is optional —
                10 ICP at mint (2.7 ICP canister cycles / 7.3 ICP network ops).
              </p>

              <div style={styles.ctaRowTop}>
                <button type="button" onClick={exploreFeed} style={styles.primaryBtn}>
                  Explore the public feed
                </button>
                <button type="button" onClick={createAccount} style={styles.secondaryBtn}>
                  {isLocal ? "Continue (local)" : "Create your account"}
                </button>
              </div>

              <div className="ice-public-features" style={styles.featureRow}>
                <div style={styles.featureCard}>
                  <div style={styles.featureTitle}>Post</div>
                  <div style={styles.featureText}>Share updates that live with the network.</div>
                </div>
                <div style={styles.featureCard}>
                  <div style={styles.featureTitle}>Profile</div>
                  <div style={styles.featureText}>A public username and bio on the network.</div>
                </div>
                <div style={styles.featureCard}>
                  <div style={styles.featureTitle}>Optional site</div>
                  <div style={styles.featureText}>Mint a personal site for 10 ICP when you want one.</div>
                </div>
                <div style={styles.featureCard}>
                  <div style={styles.featureTitle}>ICP tips</div>
                  <div style={styles.featureText}>Tip someone in ICP from their profile when tipping is on.</div>
                </div>
              </div>

              <p style={styles.supportJargon}>
                Built as an ICP social app on the Internet Computer. Technical details stay optional —
                see About if you want the stack story.
              </p>

              <div style={styles.authNote}>
                <div style={styles.authNoteTitle}>Before you create an account</div>
                <ul style={styles.authNoteList}>
                  <li>No crypto wallet needed to start.</li>
                  <li>Sign-in usually takes about a minute (passkey, Face ID, or security key).</li>
                  <li>You recover access through Internet Identity on your devices — not email/password.</li>
                  <li>Browsing the public feed is free. A username is free. Minting a site is a separate 10 ICP step.</li>
                  <li>Public posts are visible to everyone.</li>
                </ul>
                <button type="button" onClick={createAccount} style={styles.primaryBtnCompact}>
                  Create your account
                </button>
                <p style={styles.authNoteFoot}>
                  Already have an account?{" "}
                  <button type="button" onClick={signIn} style={styles.linkBtn}>
                    Sign in
                  </button>
                </p>
              </div>

            </div>
          </section>

          <section
            id="public-feed"
            ref={feedRef}
            style={styles.feedCol}
            aria-label="Public feed"
          >
            <div style={{ ...styles.glass, padding: "1.15rem 1.15rem 1.35rem" }}>
              <div style={styles.feedHead}>
                <div style={styles.feedTitle}>
                  <span style={styles.liveDot} />
                  <span>Public feed</span>
                </div>
                <span style={styles.feedMeta}>Public preview</span>
              </div>
              <p style={styles.feedExplainer}>
                Public preview — anyone can read. Create a free username to post or reply.
              </p>

              {pendingPosts && (
                <button type="button" onClick={showNewPosts} style={styles.newPostsChip}>
                  New posts
                </button>
              )}

              {loading && (
                <div style={styles.skeletonWrap}>
                  <div style={styles.skeleton} />
                  <div style={{ ...styles.skeleton, width: "88%" }} />
                  <div style={{ ...styles.skeleton, width: "72%" }} />
                </div>
              )}
              {error && (
                <div style={styles.errorBox}>
                  <p style={{ color: "#f87171", fontSize: "0.9rem", margin: "0 0 0.55rem" }}>
                    {error}
                  </p>
                  <button type="button" onClick={loadInitial} style={styles.retryBtn}>
                    Try again
                  </button>
                </div>
              )}
              {!loading && !error && posts.length === 0 && (
                <div style={styles.empty}>
                  <p style={{ color: "#94a3b8", margin: "0 0 0.5rem", fontWeight: 600 }}>
                    No public posts yet
                  </p>
                  <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "0 0 0.85rem" }}>
                    Be the first to say hello.
                  </p>
                  <button type="button" onClick={createAccount} style={styles.secondaryBtn}>
                    Create your account
                  </button>
                </div>
              )}

              <div style={styles.feedList}>
                {posts.map((post, index) => {
                  const id = postIdKey(post.id);
                  const comments = expanded[id];
                  const open = comments !== undefined;
                  const cat = categoryMap[id] || DEFAULT_CATEGORY;
                  const cs = categoryStyle(cat);
                  const body = String(post.content || "").trim();
                  const short = excerpt(body, 220);
                  const truncated = short !== body;
                  const showFull = !!fullBody[id];
                  const bucket = activityBucket(post.timestamp);
                  const highlighted = worthALook.has(id);
                  const imageUrl =
                    post.imageURL && post.imageURL.length > 0
                      ? post.imageURL[0]
                      : null;
                  const prevBucket =
                    index > 0 ? activityBucket(posts[index - 1]?.timestamp) : bucket;
                  const showEarlier =
                    index > 0 && prevBucket !== null && bucket === null;

                  return (
                    <React.Fragment key={id}>
                      {showEarlier && (
                        <div style={styles.earlierDivider} role="separator">
                          Earlier
                        </div>
                      )}
                      <article style={styles.card}>
                        <div style={styles.postTop}>
                          <Username actor={actor} principal={post.author} size={34} />
                          <TimeAgo timestamp={post.timestamp} />
                          {bucket === "today" && (
                            <span style={styles.activityToday}>Today</span>
                          )}
                          {bucket === "week" && (
                            <span style={styles.activityWeek}>This week</span>
                          )}
                          {highlighted && (
                            <span style={styles.worthBadge}>Worth a look</span>
                          )}
                          <span
                            style={{
                              fontSize: "0.65rem",
                              fontWeight: 600,
                              padding: "0.15rem 0.45rem",
                              borderRadius: "999px",
                              border: `1px solid ${cs.border}`,
                              background: cs.bg,
                              color: cs.color,
                              marginLeft: "auto",
                            }}
                          >
                            {cat}
                          </span>
                        </div>
                        <p style={styles.postText}>{showFull || !truncated ? body : short}</p>
                        {showFull && imageUrl && (
                          <img
                            src={String(imageUrl)}
                            alt=""
                            style={styles.postImage}
                          />
                        )}
                        {truncated && (
                          <button
                            type="button"
                            onClick={() => toggleFullBody(post.id)}
                            style={styles.showFullBtn}
                          >
                            {showFull ? "Show less" : "Show full post"}
                          </button>
                        )}
                        <div style={styles.stats}>
                          <span>{Number(post.likes ?? 0)} likes</span>
                          <span>{Number(post.loves ?? 0)} loves</span>
                          <button
                            type="button"
                            onClick={() => loadComments(post.id)}
                            style={styles.commentToggle}
                          >
                            {open ? "Hide comments" : "View comments"}
                          </button>
                        </div>
                        {open && (
                          <div style={styles.comments}>
                            {comments.length === 0 ? (
                              <p style={{ color: "#475569", fontSize: "0.85rem", margin: 0 }}>
                                No comments yet.
                              </p>
                            ) : (
                              comments.map((c) => (
                                <div
                                  key={c.id?.toString?.() ?? String(c.id)}
                                  style={styles.comment}
                                >
                                  <div style={styles.commentMeta}>
                                    <Username actor={actor} principal={c.author} size={20} />
                                    <TimeAgo timestamp={c.timestamp} />
                                  </div>
                                  <p style={styles.commentText}>{c.content}</p>
                                </div>
                              ))
                            )}
                            <p style={styles.joinHint}>
                              <button type="button" onClick={createAccount} style={styles.linkBtn}>
                                Create your account
                              </button>
                              {" or "}
                              <button type="button" onClick={signIn} style={styles.linkBtn}>
                                Sign in
                              </button>{" "}
                              to like, love, or reply.
                            </p>
                          </div>
                        )}
                      </article>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </section>
        </main>

        <section style={styles.trustBlock} aria-label="Trust">
          <h2 style={styles.trustTitle}>Trust</h2>
          <ul style={styles.trustList}>
            <li>
              <strong style={styles.trustStrong}>Security:</strong> Sign-in uses Internet Identity
              (passkeys / device unlock) — no site password store.
            </li>
            <li>
              <strong style={styles.trustStrong}>Your data:</strong> Public posts are visible to
              everyone. Account and messaging data live on the network; we don’t sell an ad profile
              of you.
            </li>
            <li>
              <strong style={styles.trustStrong}>Moderation:</strong> Reported posts can be reviewed
              and hidden when needed.
            </li>
            <li>
              <strong style={styles.trustStrong}>Support:</strong> Use Message the founder on this
              page for a short private note.
            </li>
          </ul>
        </section>

        <section style={styles.partnersBlock} aria-label="Partners">
          <div style={styles.partnersHead}>
            <h2 style={styles.partnersTitle}>Partners</h2>
            <a href="/partners" style={styles.partnersLink}>
              Resources →
            </a>
          </div>
          <p style={styles.disclosure}>
            Affiliate disclosure: some partner links may earn ICE/Frosted Blocks a commission at no
            extra cost to you. These are optional resources — not required to use ICE.
          </p>
          <div style={styles.adGrid}>
            <BinanceUsAd />
            <LedgerAffiliateAd />
          </div>
        </section>

        <footer style={styles.footer}>
          <p style={{ margin: "0 0 0.35rem" }}>
            <span style={{ color: "#94a3b8", fontWeight: 600 }}>ICE Network</span>
            <span style={{ color: "#475569" }}> · frostedblocks.com</span>
          </p>
          <p style={{ margin: 0, color: "#475569", fontSize: "0.78rem" }}>
            <a href="/about" style={styles.footerLink}>
              About
            </a>
            {" · "}
            <a href="/how-to-join" style={styles.footerLink}>
              How to join
            </a>
            {" · "}
            <a href="/partners" style={styles.footerLink}>
              Partners
            </a>
          </p>
        </footer>
      </div>

      <style>{`
        @media (min-width: 960px) {
          .ice-public-main {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1.05fr) !important;
            gap: 1.35rem !important;
            align-items: start !important;
          }
        }
        @media (max-width: 720px) {
          .ice-public-features { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 480px) {
          .ice-public-features { grid-template-columns: 1fr !important; }
        }
        .ice-public-header a:hover { color: #e2e8f0 !important; }
      `}</style>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#07070b",
    color: "#e2e8f0",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    position: "relative",
    overflowX: "hidden",
  },
  orbs: { pointerEvents: "none", position: "fixed", inset: 0, zIndex: 0 },
  orb: { position: "absolute", borderRadius: "50%", filter: "blur(72px)" },
  orbA: {
    left: "-8rem",
    top: "8%",
    width: "22rem",
    height: "22rem",
    background: "rgba(56, 189, 248, 0.14)",
  },
  orbB: {
    right: "-6rem",
    top: "18%",
    width: "24rem",
    height: "24rem",
    background: "rgba(139, 92, 246, 0.13)",
  },
  orbC: {
    bottom: "8%",
    left: "28%",
    width: "16rem",
    height: "16rem",
    background: "rgba(99, 102, 241, 0.1)",
  },
  wrap: {
    position: "relative",
    zIndex: 1,
    maxWidth: "72rem",
    margin: "0 auto",
    padding: "1rem 1.15rem 2.5rem",
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "1.15rem",
    gap: "0.75rem",
    flexWrap: "wrap",
    padding: "0.6rem 0.85rem",
    borderRadius: 16,
    background: "rgba(14, 16, 28, 0.55)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
  },
  brandRow: { display: "flex", alignItems: "center", gap: "0.7rem" },
  logo: {
    width: "2.35rem",
    height: "2.35rem",
    borderRadius: "0.85rem",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "linear-gradient(135deg, rgba(56,189,248,0.35), rgba(139,92,246,0.35))",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.78rem",
    fontWeight: 800,
    color: "#fff",
  },
  brandName: { fontSize: "0.92rem", fontWeight: 750, color: "#f8fafc" },
  domain: { fontSize: "0.72rem", color: "#64748b" },
  headerActions: { display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap" },
  navLink: {
    color: "#94a3b8",
    fontSize: "0.82rem",
    fontWeight: 600,
    textDecoration: "none",
    padding: "0.35rem 0.45rem",
  },
  loginBtn: {
    borderRadius: "999px",
    border: "1px solid rgba(125, 211, 252, 0.4)",
    background: "rgba(56, 189, 248, 0.12)",
    color: "#7dd3fc",
    fontSize: "0.85rem",
    fontWeight: 700,
    padding: "0.45rem 1.05rem",
    cursor: "pointer",
  },
  main: {
    display: "grid",
    gap: "1.15rem",
    flex: 1,
    alignItems: "start",
    gridTemplateColumns: "1fr",
  },
  heroCol: {},
  glass: {
    background: "rgba(18, 20, 32, 0.58)",
    backdropFilter: "blur(22px)",
    WebkitBackdropFilter: "blur(22px)",
    border: "1px solid rgba(148, 163, 184, 0.16)",
    boxShadow: "0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)",
    borderRadius: "1.35rem",
    padding: "1.35rem 1.35rem 1.45rem",
  },
  accentLine: {
    height: 1,
    width: "100%",
    marginBottom: "1rem",
    background:
      "linear-gradient(90deg, transparent, rgba(125,211,252,0.55), rgba(196,181,253,0.55), transparent)",
  },
  eyebrow: {
    fontSize: "0.68rem",
    fontWeight: 700,
    letterSpacing: "0.14em",
    textTransform: "uppercase",
    color: "rgba(125,211,252,0.9)",
    margin: "0 0 0.55rem",
  },
  h1: {
    margin: "0 0 0.65rem",
    fontSize: "clamp(2rem, 4.5vw, 2.7rem)",
    fontWeight: 800,
    letterSpacing: "-0.035em",
    lineHeight: 1.08,
  },
  h1Grad: {
    display: "block",
    background: "linear-gradient(90deg, #7dd3fc, #a5b4fc, #c4b5fd)",
    WebkitBackgroundClip: "text",
    backgroundClip: "text",
    color: "transparent",
  },
  h1Sub: {
    display: "block",
    marginTop: "0.15rem",
    fontSize: "0.72em",
    fontWeight: 700,
    color: "#e2e8f0",
  },
  tagline: {
    margin: "0 0 1rem",
    fontSize: "1.02rem",
    fontWeight: 500,
    color: "#94a3b8",
    lineHeight: 1.55,
    maxWidth: "34rem",
  },
  ctaRowTop: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    marginBottom: "1rem",
  },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: "0.85rem 1.25rem",
    border: "none",
    borderRadius: "0.95rem",
    fontSize: "0.98rem",
    fontWeight: 750,
    color: "#0f172a",
    cursor: "pointer",
    background: "linear-gradient(135deg, #38bdf8 0%, #818cf8 50%, #a78bfa 100%)",
    boxShadow: "0 6px 28px rgba(129, 140, 248, 0.38)",
  },
  primaryBtnCompact: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: "0.7rem 1rem",
    border: "none",
    borderRadius: "0.85rem",
    fontSize: "0.9rem",
    fontWeight: 750,
    color: "#0f172a",
    cursor: "pointer",
    background: "linear-gradient(135deg, #38bdf8 0%, #818cf8 50%, #a78bfa 100%)",
  },
  secondaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    padding: "0.75rem 1.15rem",
    borderRadius: "0.95rem",
    border: "1px solid rgba(148, 163, 184, 0.28)",
    background: "rgba(9, 9, 11, 0.45)",
    color: "#e2e8f0",
    fontSize: "0.92rem",
    fontWeight: 650,
    cursor: "pointer",
  },
  featureRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "0.45rem",
    marginBottom: "0.85rem",
  },
  featureCard: {
    padding: "0.65rem 0.6rem",
    borderRadius: 12,
    border: "1px solid rgba(148, 163, 184, 0.14)",
    background: "rgba(9, 9, 11, 0.35)",
  },
  featureTitle: {
    fontSize: "0.78rem",
    fontWeight: 750,
    color: "#e2e8f0",
    marginBottom: "0.2rem",
  },
  featureText: { fontSize: "0.7rem", lineHeight: 1.4, color: "#64748b" },
  supportJargon: {
    margin: "0 0 0.9rem",
    fontSize: "0.75rem",
    lineHeight: 1.45,
    color: "#64748b",
  },
  authNote: {
    marginBottom: "0.85rem",
    padding: "0.9rem 0.95rem",
    borderRadius: 14,
    border: "1px solid rgba(125, 211, 252, 0.22)",
    background: "rgba(56, 189, 248, 0.06)",
  },
  authNoteTitle: {
    fontSize: "0.88rem",
    fontWeight: 750,
    color: "#e2e8f0",
    marginBottom: "0.45rem",
  },
  authNoteList: {
    margin: "0 0 0.75rem",
    paddingLeft: "1.1rem",
    color: "#94a3b8",
    fontSize: "0.78rem",
    lineHeight: 1.5,
  },
  authNoteFoot: {
    margin: "0.55rem 0 0",
    fontSize: "0.78rem",
    color: "#64748b",
    textAlign: "center",
  },
  feedCol: {},
  feedHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "0.35rem",
  },
  feedTitle: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.9rem",
    fontWeight: 700,
    color: "#e2e8f0",
  },
  liveDot: {
    width: "0.5rem",
    height: "0.5rem",
    borderRadius: "50%",
    background: "#34d399",
    boxShadow: "0 0 10px rgba(52,211,153,0.85)",
  },
  feedMeta: { fontSize: "0.72rem", color: "#64748b", fontWeight: 600 },
  feedExplainer: {
    margin: "0 0 0.85rem",
    fontSize: "0.78rem",
    color: "#64748b",
    lineHeight: 1.4,
  },
  empty: { textAlign: "center", padding: "1.75rem 1rem" },
  skeletonWrap: { display: "flex", flexDirection: "column", gap: "0.55rem", padding: "0.5rem 0 1rem" },
  skeleton: {
    height: "0.7rem",
    borderRadius: 8,
    background:
      "linear-gradient(90deg, rgba(148,163,184,0.08), rgba(148,163,184,0.16), rgba(148,163,184,0.08))",
  },
  feedList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.7rem",
  },
  card: {
    background: "rgba(15, 17, 28, 0.5)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
    borderRadius: "1rem",
    padding: "1rem",
  },
  postTop: {
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
    marginBottom: "0.55rem",
    flexWrap: "wrap",
  },
  postText: {
    margin: "0 0 0.35rem",
    color: "#e2e8f0",
    fontSize: "0.95rem",
    lineHeight: 1.55,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  showFullBtn: {
    display: "inline-block",
    margin: "0 0 0.55rem",
    border: "none",
    background: "transparent",
    color: "#7dd3fc",
    fontSize: "0.75rem",
    fontWeight: 650,
    cursor: "pointer",
    padding: 0,
  },
  postImage: {
    display: "block",
    maxWidth: "100%",
    borderRadius: 12,
    margin: "0 0 0.55rem",
    border: "1px solid rgba(148, 163, 184, 0.18)",
  },
  activityToday: {
    fontSize: "0.65rem",
    fontWeight: 700,
    padding: "0.12rem 0.45rem",
    borderRadius: 999,
    border: "1px solid rgba(52, 211, 153, 0.35)",
    background: "rgba(52, 211, 153, 0.12)",
    color: "#6ee7b7",
  },
  activityWeek: {
    fontSize: "0.65rem",
    fontWeight: 700,
    padding: "0.12rem 0.45rem",
    borderRadius: 999,
    border: "1px solid rgba(125, 211, 252, 0.35)",
    background: "rgba(56, 189, 248, 0.1)",
    color: "#7dd3fc",
  },
  worthBadge: {
    fontSize: "0.65rem",
    fontWeight: 700,
    padding: "0.12rem 0.45rem",
    borderRadius: 999,
    border: "1px solid rgba(196, 181, 253, 0.4)",
    background: "rgba(167, 139, 250, 0.14)",
    color: "#c4b5fd",
  },
  earlierDivider: {
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "#64748b",
    padding: "0.35rem 0 0.15rem",
  },
  newPostsChip: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 0 0.75rem",
    padding: "0.4rem 0.9rem",
    borderRadius: 999,
    border: "1px solid rgba(125, 211, 252, 0.45)",
    background: "rgba(56, 189, 248, 0.14)",
    color: "#e0f2fe",
    fontSize: "0.8rem",
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 0 18px rgba(56, 189, 248, 0.2)",
  },
  errorBox: { padding: "0.5rem 0 0.75rem" },
  retryBtn: {
    borderRadius: 999,
    border: "1px solid rgba(148, 163, 184, 0.35)",
    background: "rgba(9, 9, 11, 0.45)",
    color: "#e2e8f0",
    fontSize: "0.8rem",
    fontWeight: 650,
    padding: "0.4rem 0.85rem",
    cursor: "pointer",
  },
  stats: {
    display: "flex",
    alignItems: "center",
    gap: "0.85rem",
    fontSize: "0.75rem",
    color: "#64748b",
  },
  commentToggle: {
    marginLeft: "auto",
    border: "none",
    background: "transparent",
    color: "#7dd3fc",
    fontSize: "0.75rem",
    fontWeight: 650,
    cursor: "pointer",
    padding: 0,
  },
  comments: {
    marginTop: "0.75rem",
    paddingTop: "0.75rem",
    borderTop: "1px solid rgba(148,163,184,0.1)",
    display: "flex",
    flexDirection: "column",
    gap: "0.55rem",
  },
  comment: {
    padding: "0.55rem 0.65rem",
    borderRadius: 10,
    background: "rgba(9,9,11,0.4)",
    border: "1px solid rgba(148,163,184,0.1)",
  },
  commentMeta: {
    display: "flex",
    alignItems: "center",
    gap: "0.45rem",
    marginBottom: "0.25rem",
  },
  commentText: { margin: 0, color: "#cbd5e1", fontSize: "0.85rem", lineHeight: 1.45 },
  joinHint: { margin: "0.25rem 0 0", fontSize: "0.78rem", color: "#64748b" },
  linkBtn: {
    border: "none",
    background: "transparent",
    color: "#a5b4fc",
    fontWeight: 700,
    cursor: "pointer",
    padding: 0,
    fontSize: "inherit",
  },
  trustBlock: {
    marginTop: "1.25rem",
    padding: "1.1rem 1.15rem",
    borderRadius: 16,
    border: "1px solid rgba(148, 163, 184, 0.14)",
    background: "rgba(18, 20, 32, 0.45)",
  },
  trustTitle: {
    margin: "0 0 0.55rem",
    fontSize: "0.95rem",
    fontWeight: 750,
    color: "#e2e8f0",
  },
  trustList: {
    margin: 0,
    paddingLeft: "1.1rem",
    color: "#94a3b8",
    fontSize: "0.8rem",
    lineHeight: 1.55,
  },
  trustStrong: { color: "#cbd5e1", fontWeight: 650 },
  partnersBlock: {
    marginTop: "1rem",
    padding: "1rem 1.15rem 1.15rem",
    borderRadius: 16,
    border: "1px solid rgba(148, 163, 184, 0.1)",
    background: "rgba(9, 9, 11, 0.35)",
  },
  partnersHead: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "0.35rem",
  },
  partnersTitle: { margin: 0, fontSize: "0.85rem", fontWeight: 700, color: "#94a3b8" },
  partnersLink: { fontSize: "0.78rem", color: "#a5b4fc", fontWeight: 600, textDecoration: "none" },
  disclosure: {
    margin: "0 0 0.65rem",
    fontSize: "0.72rem",
    lineHeight: 1.45,
    color: "#64748b",
  },
  adGrid: { display: "flex", flexWrap: "wrap", gap: "0.5rem" },
  footer: {
    marginTop: "1.5rem",
    textAlign: "center",
    fontSize: "0.82rem",
    lineHeight: 1.5,
  },
  footerLink: { color: "#64748b", textDecoration: "none", fontWeight: 600 },
};
