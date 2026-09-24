import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  createAnonymousUserSiteActor,
  publicSiteHash,
} from "./actors";

function pairKey(entry) {
  if (Array.isArray(entry)) return entry[0];
  if (entry && typeof entry === "object") return entry[0] ?? entry._0_;
  return null;
}

function pairVal(entry) {
  if (Array.isArray(entry)) return entry[1];
  if (entry && typeof entry === "object") return entry[1] ?? entry._1_;
  return null;
}

function isLikelyCanisterId(s) {
  return typeof s === "string" && /^[a-z0-9]{5}-[a-z0-9-]+$/i.test(s.trim()) && s.length > 20;
}

/** Lightweight markdown-ish renderer (no deps). */
function renderBody(body) {
  if (!body) return null;
  const lines = String(body).split("\n");
  const blocks = [];
  let para = [];

  const flushPara = () => {
    if (!para.length) return;
    const text = para.join(" ").trim();
    if (text) {
      blocks.push(
        <p key={`p-${blocks.length}`} style={styles.para}>
          {text}
        </p>
      );
    }
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) {
      flushPara();
      continue;
    }
    if (t === "---" || t === "***") {
      flushPara();
      blocks.push(<hr key={`hr-${blocks.length}`} style={styles.hr} />);
      continue;
    }
    if (t.startsWith("### ")) {
      flushPara();
      blocks.push(
        <h3 key={`h3-${blocks.length}`} style={styles.h3}>
          {t.slice(4)}
        </h3>
      );
      continue;
    }
    if (t.startsWith("## ")) {
      flushPara();
      blocks.push(
        <h2 key={`h2-${blocks.length}`} style={styles.h2}>
          {t.slice(3)}
        </h2>
      );
      continue;
    }
    if (t.startsWith("# ")) {
      flushPara();
      blocks.push(
        <h1 key={`h1-${blocks.length}`} style={styles.h1}>
          {t.slice(2)}
        </h1>
      );
      continue;
    }
    para.push(t);
  }
  flushPara();
  return blocks.length ? blocks : <p style={styles.para}>{body}</p>;
}

function formatTime(ts) {
  try {
    const n = typeof ts === "bigint" ? Number(ts) : Number(ts);
    // Motoko Time is nanoseconds
    const ms = n > 1e15 ? n / 1e6 : n;
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}

function photoIdKey(id) {
  if (id == null) return "";
  if (typeof id === "bigint") return id.toString();
  return String(id);
}

function normalizePublicPhoto(p, siteCanisterId) {
  if (!p) return null;
  const id = p.id;
  let url = p.url || "";
  const path = p.path || `/photos/${photoIdKey(id)}`;
  if (!url && siteCanisterId) {
    url = `https://${siteCanisterId}.raw.icp0.io${path.startsWith("/") ? path : `/${path}`}`;
  }
  return { id, url, path, contentType: p.contentType || "image/webp" };
}

function unwrapOptText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v[0] ? String(v[0]) : "";
  return String(v);
}

/**
 * Public read-only personal website viewer.
 * URL: #/site/<canisterId>[/<pageId>] or ?site=<id>&page=<page>
 */
export default function PublicSite({
  siteId,
  initialPage = null,
  onLeave,
  customDomainMode = false,
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [pages, setPages] = useState([]);
  const [features, setFeatures] = useState({});
  const [settings, setSettings] = useState({});
  const [domain, setDomain] = useState(null);
  const [linked, setLinked] = useState(true);
  const [posts, setPosts] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [bannerUrl, setBannerUrl] = useState("");
  const [activePageId, setActivePageId] = useState(initialPage || "profile");
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!siteId || !isLikelyCanisterId(siteId)) {
      setError("Invalid site canister ID.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const site = await createAnonymousUserSiteActor(siteId);

      const [prof, pageList, featurePairs, settingPairs, linkedNet, domainSt, feed, photoList, banner] =
        await Promise.all([
          site.getProfile().catch(() => null),
          site.listPages().catch(() => []),
          site.listFeatures ? site.listFeatures().catch(() => []) : [],
          site.listSettings ? site.listSettings().catch(() => []) : [],
          site.isLinkedToNetwork ? site.isLinkedToNetwork().catch(() => true) : true,
          site.getDomainStatus ? site.getDomainStatus().catch(() => null) : null,
          site.getLocalFeed ? site.getLocalFeed(30).catch(() => []) : [],
          site.listPhotos ? site.listPhotos().catch(() => []) : [],
          site.getBannerURL ? site.getBannerURL().catch(() => "") : "",
        ]);

      setProfile(prof);
      const normalizedPhotos = (Array.isArray(photoList) ? photoList : [])
        .map((ph) => normalizePublicPhoto(ph, siteId))
        .filter((ph) => ph && ph.url);
      setPhotos(normalizedPhotos);
      setBannerUrl(typeof banner === "string" ? banner : "");
      const plist = Array.isArray(pageList) ? pageList : [];
      // Sort: profile first, then alpha
      plist.sort((a, b) => {
        if (a.id === "profile") return -1;
        if (b.id === "profile") return 1;
        return String(a.id).localeCompare(String(b.id));
      });
      setPages(plist);

      const fmap = {};
      for (const e of featurePairs || []) {
        const k = pairKey(e);
        const v = pairVal(e);
        if (k != null) fmap[String(k)] = !!v;
      }
      setFeatures(fmap);

      const smap = {};
      for (const e of settingPairs || []) {
        const k = pairKey(e);
        const v = pairVal(e);
        if (k != null) smap[String(k)] = v == null ? "" : String(v);
      }
      setSettings(smap);

      setLinked(!!linkedNet);
      setDomain(domainSt);
      setPosts(Array.isArray(feed) ? feed : []);

      // Resolve active page
      setActivePageId((prev) => {
        const want = initialPage || prev || "profile";
        if (plist.some((p) => p.id === want)) return want;
        if (plist.some((p) => p.id === "profile")) return "profile";
        return plist[0]?.id || "profile";
      });
    } catch (e) {
      console.error(e);
      setError(
        e?.message ||
          "Could not load this site. Check the canister ID and that the site is online."
      );
    } finally {
      setLoading(false);
    }
  }, [siteId, initialPage]);

  useEffect(() => {
    load();
  }, [load]);

  // Sync hash when page changes
  const selectPage = (id) => {
    setActivePageId(id);
    try {
      const hash = publicSiteHash(siteId, id);
      if (window.location.hash !== hash) {
        window.history.replaceState(null, "", hash);
      }
    } catch (_) {}
  };

  const activePage = useMemo(
    () => pages.find((p) => p.id === activePageId) || pages[0] || null,
    [pages, activePageId]
  );

  const displayName =
    settings.displayName ||
    profile?.username ||
    (profile?.username === "" ? "Member" : null) ||
    "Personal site";

  const publicProfile = features.publicProfile !== false;
  const showFeed = features.localFeed !== false;
  const theme = settings.theme || "ice-dark";

  const shareUrl = useMemo(() => {
    try {
      const base = window.location.origin + window.location.pathname;
      return `${base}${publicSiteHash(siteId, activePageId)}`;
    } catch {
      return publicSiteHash(siteId, activePageId);
    }
  }, [siteId, activePageId]);

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {}
  };

  const goIce = () => {
    if (onLeave) onLeave();
    else {
      window.location.hash = "";
      window.location.search = "";
      window.location.reload();
    }
  };

  if (loading) {
    return (
      <div className="ice-app">
        <div className="ice-loading">Loading site…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ice-app">
        <div className="ice-app-inner" style={{ paddingTop: "2.5rem" }}>
          <div className="ice-alert-error">{error}</div>
          <button type="button" className="ice-btn-primary" onClick={goIce}>
            Back to ICE
          </button>
        </div>
      </div>
    );
  }

  if (!publicProfile) {
    return (
      <div className="ice-app">
        <div className="ice-app-inner" style={{ paddingTop: "2.5rem" }}>
          <div className="ice-glass" style={{ padding: "2rem", textAlign: "center" }}>
            <h1 className="ice-title" style={{ marginTop: 0 }}>
              Private site
            </h1>
            <p style={{ color: "#94a3b8" }}>
              The owner has turned off public profile for this canister.
            </p>
            <button type="button" className="ice-btn-primary" onClick={goIce}>
              Back to ICE
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`ice-app ice-public-site theme-${theme}`}>
      <div className="ice-app-orbs" aria-hidden="true">
        <span className="o1" />
        <span className="o2" />
        <span className="o3" />
      </div>

      <div className="ice-app-inner ice-wide" style={{ paddingTop: 0 }}>
        <header className="ice-shell-header" style={{ marginBottom: "1.25rem" }}>
          <div className="ice-shell-row">
            <div className="ice-brand-wrap">
              <button
                type="button"
                className="ice-brand-mark"
                onClick={goIce}
                style={{ border: "none", cursor: "pointer", padding: 0 }}
                title="ICE home"
              >
                ICE
              </button>
              <div className="ice-brand-meta">
                <div style={{ fontWeight: 700, color: "#f8fafc", fontSize: "0.95rem" }}>
                  {customDomainMode ? window.location.hostname : "Personal site"}
                </div>
                <span className="ice-brand-sub">
                  {customDomainMode ? "Custom domain" : "Public view"}
                </span>
              </div>
            </div>
            <div className="ice-header-actions">
              <button type="button" className="ice-btn" onClick={copyLink}>
                {copied ? "Copied" : "Copy link"}
              </button>
              <button type="button" className="ice-btn" onClick={load}>
                Refresh
              </button>
              <button type="button" className="ice-btn-primary" onClick={goIce}>
                Open ICE
              </button>
            </div>
          </div>
        </header>

        {/* Hero */}
        <section className="ice-glass" style={styles.hero}>
          <div style={styles.heroTop}>
            <div style={styles.avatarFallback}>
              {(displayName || "S").slice(0, 1).toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 style={styles.heroName}>{displayName}</h1>
              {profile?.bio && <p style={styles.heroBio}>{profile.bio}</p>}
              <div style={styles.badgeRow}>
                <span className={`ice-status ${linked ? "ice-status-ok" : "ice-status-muted"}`}>
                  {linked ? "ICE linked" : "Independent"}
                </span>
                {domain?.customDomain && (
                  <span className="ice-status ice-status-ok">
                    {domain.customDomain}
                  </span>
                )}
                {domain?.publicUrl && (
                  <a
                    href={domain.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ice-link"
                    style={{ fontSize: "0.8rem" }}
                  >
                    {domain.publicUrl.replace(/^https?:\/\//, "")}
                  </a>
                )}
              </div>
            </div>
          </div>
          <p style={styles.canisterLine}>
            Canister{" "}
            <code className="ice-mono" style={{ color: "#cbd5e1", fontSize: "0.75rem" }}>
              {siteId}
            </code>
          </p>
        </section>

        {bannerUrl ? (
          <div className="ice-glass-soft" style={styles.bannerWrap}>
            <img
              src={bannerUrl}
              alt=""
              style={styles.bannerImg}
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        ) : null}

        {photos.length > 0 && (
          <section className="ice-section" style={{ marginTop: "1rem" }}>
            <div className="ice-section-title">Photos</div>
            <p style={styles.publicNote}>
              Public gallery — these images are open on the internet via the site canister.
            </p>
            <div style={styles.photoGrid}>
              {photos.map((ph) => (
                <a
                  key={photoIdKey(ph.id)}
                  href={ph.url}
                  target="_blank"
                  rel="noreferrer"
                  style={styles.photoCell}
                >
                  <img
                    src={ph.url}
                    alt={`Photo ${photoIdKey(ph.id)}`}
                    style={styles.photoImg}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.opacity = "0.25";
                    }}
                  />
                </a>
              ))}
            </div>
          </section>
        )}

        {/* Page nav */}
        {pages.length > 0 && (
          <nav className="ice-tabs" style={{ marginTop: "1rem" }} aria-label="Site pages">
            {pages.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`ice-tab${activePageId === p.id ? " is-active" : ""}`}
                onClick={() => selectPage(p.id)}
              >
                {p.id === "profile" ? "Home" : p.title || p.id}
              </button>
            ))}
            {showFeed && posts.length > 0 && (
              <button
                type="button"
                className={`ice-tab${activePageId === "__feed" ? " is-active" : ""}`}
                onClick={() => selectPage("__feed")}
              >
                Feed
              </button>
            )}
          </nav>
        )}

        {/* Page body */}
        {activePageId === "__feed" ? (
          <section className="ice-section" style={{ marginTop: "0.5rem" }}>
            <div className="ice-section-title">Local feed</div>
            {posts.length === 0 ? (
              <div className="ice-empty ice-glass-soft">No posts yet.</div>
            ) : (
              posts.map((p) => (
                <article
                  key={String(p.id)}
                  className="ice-glass-soft"
                  style={{ padding: "1rem 1.1rem", marginBottom: "0.65rem" }}
                >
                  <div style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: "0.4rem" }}>
                    {formatTime(p.timestamp)}
                  </div>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "#e2e8f0", lineHeight: 1.55 }}>
                    {p.content}
                  </p>
                  {unwrapOptText(p.imageURL) ? (
                    <img
                      src={unwrapOptText(p.imageURL)}
                      alt=""
                      style={styles.postImg}
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                </article>

              ))
            )}
          </section>
        ) : activePage ? (
          <article className="ice-glass" style={styles.pageCard}>
            {activePage.id !== "profile" && (
              <h2 style={styles.pageTitle}>{activePage.title || activePage.id}</h2>
            )}
            <div style={styles.pageBody}>{renderBody(activePage.body)}</div>
          </article>
        ) : (
          <div className="ice-empty ice-glass-soft">No pages on this site yet.</div>
        )}

        {/* Feed below home when on profile */}
        {activePageId === "profile" && showFeed && posts.length > 0 && (
          <section className="ice-section" style={{ marginTop: "1.25rem" }}>
            <div className="ice-section-title">Recent posts</div>
            {posts.slice(0, 5).map((p) => (
              <article
                key={String(p.id)}
                className="ice-glass-soft"
                style={{ padding: "0.9rem 1rem", marginBottom: "0.55rem" }}
              >
                <div style={{ fontSize: "0.72rem", color: "#64748b", marginBottom: "0.35rem" }}>
                  {formatTime(p.timestamp)}
                </div>
                <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "#e2e8f0", lineHeight: 1.5 }}>
                  {p.content}
                </p>
              </article>
            ))}
            {posts.length > 5 && (
              <button type="button" className="ice-btn" onClick={() => selectPage("__feed")}>
                View all posts
              </button>
            )}
          </section>
        )}

        <footer style={styles.footer}>
          <span>Powered by ICE Network</span>
          <button type="button" className="ice-link" onClick={goIce}>
            Create your account
          </button>
        </footer>
      </div>
    </div>
  );
}

const styles = {
  hero: {
    padding: "1.35rem 1.4rem",
  },
  heroTop: {
    display: "flex",
    gap: "1rem",
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 16,
    objectFit: "cover",
    border: "1px solid rgba(148,163,184,0.25)",
    flexShrink: 0,
  },
  bannerWrap: {
    marginTop: "0.85rem",
    overflow: "hidden",
    borderRadius: 14,
    padding: 0,
  },
  bannerImg: {
    display: "block",
    width: "100%",
    maxHeight: 220,
    objectFit: "cover",
  },
  publicNote: {
    margin: "0 0 0.65rem",
    fontSize: "0.75rem",
    color: "#94a3b8",
    lineHeight: 1.45,
  },
  photoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
    gap: "0.55rem",
  },
  photoCell: {
    display: "block",
    borderRadius: 12,
    overflow: "hidden",
    border: "1px solid rgba(148,163,184,0.22)",
    background: "rgba(15,23,42,0.55)",
  },
  photoImg: {
    display: "block",
    width: "100%",
    height: 140,
    objectFit: "cover",
  },
  postImg: {
    display: "block",
    width: "100%",
    maxHeight: 360,
    objectFit: "cover",
    borderRadius: 10,
    marginTop: "0.65rem",
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 16,
    display: "grid",
    placeItems: "center",
    fontSize: "1.5rem",
    fontWeight: 800,
    color: "#0f172a",
    background: "linear-gradient(135deg, #38bdf8 0%, #818cf8 50%, #a78bfa 100%)",
    flexShrink: 0,
  },
  heroName: {
    margin: 0,
    fontSize: "1.55rem",
    fontWeight: 700,
    letterSpacing: "-0.03em",
    color: "#f8fafc",
  },
  heroBio: {
    margin: "0.4rem 0 0",
    color: "#94a3b8",
    fontSize: "0.95rem",
    lineHeight: 1.5,
  },
  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.45rem",
    marginTop: "0.65rem",
    alignItems: "center",
  },
  canisterLine: {
    margin: "0.85rem 0 0",
    fontSize: "0.72rem",
    color: "#64748b",
  },
  pageCard: {
    padding: "1.35rem 1.4rem",
    marginTop: "0.25rem",
  },
  pageTitle: {
    margin: "0 0 0.85rem",
    fontSize: "1.25rem",
    color: "#f8fafc",
    letterSpacing: "-0.02em",
  },
  pageBody: {
    color: "#e2e8f0",
  },
  para: {
    margin: "0 0 0.85rem",
    lineHeight: 1.65,
    color: "#cbd5e1",
    fontSize: "0.95rem",
  },
  h1: {
    margin: "0 0 0.75rem",
    fontSize: "1.4rem",
    color: "#f8fafc",
    letterSpacing: "-0.02em",
  },
  h2: {
    margin: "1.1rem 0 0.55rem",
    fontSize: "1.15rem",
    color: "#f1f5f9",
  },
  h3: {
    margin: "0.9rem 0 0.45rem",
    fontSize: "1rem",
    color: "#e2e8f0",
  },
  hr: {
    border: "none",
    borderTop: "1px solid rgba(148,163,184,0.15)",
    margin: "1.1rem 0",
  },
  footer: {
    marginTop: "2.5rem",
    paddingTop: "1rem",
    borderTop: "1px solid rgba(148,163,184,0.1)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.75rem",
    flexWrap: "wrap",
    fontSize: "0.8rem",
    color: "#64748b",
  },
};
