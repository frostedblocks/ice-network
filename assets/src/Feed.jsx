import React, { useState, useEffect, useMemo } from "react";
import PostCard from "./PostCard";
import LitePostCard from "./LitePostCard";
import SearchBar from "./SearchBar";
import { DEFAULT_CATEGORY } from "./categories";

const LITE_FEED_URL = "https://lite.frostedblocks.com/api/lite-feed?limit=25";

/**
 * Feed: All = main ICE discovery (never shows detached authors) + read-only Lite posts.
 * Following = people you follow (includes detached authors for their followers only).
 * Lite posts are pulled over HTTP — not written to the ICE canister.
 */
export default function Feed({ actor, currentUserPrincipal, onUserClick, refreshKey = 0 }) {
  const [posts, setPosts] = useState([]);
  const [litePosts, setLitePosts] = useState([]);
  const [categoryMap, setCategoryMap] = useState({}); // postId string -> category
  const [followed, setFollowed] = useState([]);
  const [blockedAuthors, setBlockedAuthors] = useState(() => new Set()); // principal text
  const [filterMode, setFilterMode] = useState("all"); // "all" | "following"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isSearch, setIsSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const loadLitePosts = async () => {
    try {
      const res = await fetch(LITE_FEED_URL, { method: "GET", credentials: "omit" });
      if (!res.ok) {
        setLitePosts([]);
        return;
      }
      const data = await res.json();
      setLitePosts(Array.isArray(data.posts) ? data.posts : []);
    } catch (e) {
      console.error(e);
      setLitePosts([]);
    }
  };

  const loadCategoriesFor = async (list) => {
    if (!actor || !list?.length) {
      setCategoryMap({});
      return;
    }
    try {
      if (actor.getCategoriesForPosts) {
        const ids = list.map((p) => p.id);
        const pairs = await actor.getCategoriesForPosts(ids);
        const map = {};
        for (const entry of pairs || []) {
          // Candid tuple: [nat, text] or { 0, 1 }
          const id = entry?.[0] ?? entry?._0_ ?? entry?.[0];
          const cat = entry?.[1] ?? entry?._1_ ?? entry?.[1];
          if (id !== undefined && id !== null) {
            map[id.toString()] = cat || DEFAULT_CATEGORY;
          }
        }
        setCategoryMap(map);
        return;
      }
    } catch (err) {
      console.error(err);
    }
    // Fallback: mark all General
    const map = {};
    for (const p of list) {
      map[p.id.toString()] = DEFAULT_CATEGORY;
    }
    setCategoryMap(map);
  };

  const loadFollowed = async () => {
    if (!actor || !currentUserPrincipal || !actor.getFollowedCategories) {
      setFollowed([]);
      return;
    }
    try {
      const list = await actor.getFollowedCategories(currentUserPrincipal);
      setFollowed(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error(err);
      setFollowed([]);
    }
  };

  /** Hide authors blocked either way vs the viewer */
  const loadBlockedAuthors = async (list) => {
    if (!actor || !currentUserPrincipal || !list?.length) {
      setBlockedAuthors(new Set());
      return;
    }
    try {
      if (actor.filterBlockedAuthors) {
        const authors = [];
        const seen = new Set();
        for (const p of list) {
          const key = p.author?.toString?.() ?? "";
          if (!key || seen.has(key)) continue;
          seen.add(key);
          authors.push(p.author);
        }
        const blocked = await actor.filterBlockedAuthors(currentUserPrincipal, authors);
        const set = new Set((blocked || []).map((p) => p.toString()));
        setBlockedAuthors(set);
        return;
      }
      if (actor.getBlocked) {
        const mine = await actor.getBlocked(currentUserPrincipal);
        const set = new Set((mine || []).map((p) => p.toString()));
        setBlockedAuthors(set);
        return;
      }
    } catch (err) {
      console.error(err);
    }
    setBlockedAuthors(new Set());
  };

  const loadFeed = async (mode = filterMode) => {
    if (!actor) return;

    setLoading(true);
    setError("");
    setIsSearch(false);
    setSearchQuery("");

    try {
      let result;
      if (mode === "following" && currentUserPrincipal && actor.getFollowingPeoplePosts) {
        // Followers' people-feed only place detached authors appear (for those who follow them)
        result = await actor.getFollowingPeoplePosts(50);
      } else if (currentUserPrincipal && actor.getHomeFeed) {
        // Main ICE feed — never includes detached authors
        result = await actor.getHomeFeed(50);
      } else {
        result = await actor.getRecentPosts(50);
      }
      const list = Array.isArray(result) ? result : [];
      setPosts(list);
      const tasks = [loadCategoriesFor(list), loadFollowed(), loadBlockedAuthors(list)];
      // Lite bridge into All feed only (read-only; skip Following / avoid noise)
      if (mode === "all") tasks.push(loadLitePosts());
      else setLitePosts([]);
      await Promise.all(tasks);
    } catch (err) {
      console.error(err);
      setError("Could not load posts.");
    } finally {
      setLoading(false);
    }
  };

  const loadRecent = () => loadFeed("all");

  const handleSearch = async (query) => {
    if (!actor) return;

    setLoading(true);
    setError("");
    setIsSearch(true);
    setSearchQuery(query);

    try {
      const result = await actor.searchPosts(query);
      const list = Array.isArray(result) ? result : [];
      setPosts(list);
      setLitePosts([]);
      await Promise.all([loadCategoriesFor(list), loadBlockedAuthors(list)]);
    } catch (err) {
      console.error(err);
      setError("Search failed.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed(filterMode);
  }, [actor, refreshKey, currentUserPrincipal, filterMode]);

  // Reload when returning to the tab/app (e.g. phone browser resumes)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && actor && !isSearch) {
        loadFeed(filterMode);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [actor, isSearch, filterMode]);

  const visiblePosts = useMemo(() => {
    let list = posts;
    if (blockedAuthors.size > 0) {
      list = list.filter((p) => {
        const author = p.author?.toString?.() ?? "";
        return !blockedAuthors.has(author);
      });
    }
    return list;
  }, [posts, blockedAuthors]);

  /** Merged All feed: ICE canister posts + read-only Lite posts, newest first. */
  const mergedFeedItems = useMemo(() => {
    if (isSearch || filterMode !== "all") {
      return visiblePosts.map((p) => ({ kind: "ice", post: p, ts: Number(p.timestamp) || 0 }));
    }
    const ice = visiblePosts.map((p) => ({
      kind: "ice",
      post: p,
      ts: Number(p.timestamp) || 0,
    }));
    const lite = (litePosts || []).map((p) => ({
      kind: "lite",
      post: p,
      ts: Number(p.timestamp) || 0,
    }));
    return [...ice, ...lite].sort((a, b) => b.ts - a.ts);
  }, [visiblePosts, litePosts, filterMode, isSearch]);

  const toggleStyle = (active) => ({
    background: active
      ? "linear-gradient(135deg, rgba(56, 189, 248, 0.28) 0%, rgba(129, 140, 248, 0.28) 100%)"
      : "rgba(255, 255, 255, 0.04)",
    color: active ? "#e0f2fe" : "#94a3b8",
    border: active ? "1px solid rgba(56, 189, 248, 0.45)" : "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: "8px",
    padding: "0.3rem 0.75rem",
    fontSize: "0.8rem",
    fontWeight: active ? 600 : 500,
    cursor: "pointer",
  });

  return (
    <div>
      <SearchBar onSearch={handleSearch} onClear={loadRecent} />

      <div className="ice-page-header" style={{ marginBottom: "0.85rem" }}>
        <div>
          <h2 style={{ fontSize: "1.1rem" }}>
            {isSearch
              ? `Results for “${searchQuery}”`
              : filterMode === "following"
              ? "Following — people you follow"
              : "Recent posts on ICE Network ICP"}
          </h2>
        </div>
        <div className="ice-page-actions">
          {!isSearch && (
            <div className="ice-tabs" style={{ marginBottom: 0, padding: "0.2rem" }}>
              <button
                type="button"
                className={`ice-tab${filterMode === "all" ? " is-active" : ""}`}
                style={{ minWidth: "auto", flex: "0 0 auto" }}
                onClick={() => setFilterMode("all")}
              >
                All
              </button>
              <button
                type="button"
                className={`ice-tab${filterMode === "following" ? " is-active" : ""}`}
                style={{ minWidth: "auto", flex: "0 0 auto" }}
                onClick={() => setFilterMode("following")}
                title="People you follow (includes detached members’ posts)"
              >
                Following
              </button>
            </div>
          )}
          <button type="button" onClick={() => loadFeed(filterMode)} className="ice-btn">
            Refresh
          </button>
        </div>
      </div>

      {!isSearch && filterMode === "following" && !loading && posts.length === 0 && (
        <div
          className="ice-glass-soft"
          style={{
            padding: "0.85rem 1rem",
            marginBottom: "1rem",
            color: "#94a3b8",
            fontSize: "0.9rem",
          }}
        >
          No posts from people you follow yet. Use{" "}
          <strong style={{ color: "#e2e8f0" }}>Follow</strong> on someone’s profile. Detached members’
          posts only appear here (and on their own profile), never on{" "}
          <strong style={{ color: "#e2e8f0" }}>All</strong>.
        </div>
      )}

      {loading && <p style={{ color: "#64748b" }}>Loading…</p>}

      {error && (
        <div>
          <p style={{ color: "#f87171" }}>{error}</p>
          <button onClick={loadRecent} style={{ color: "#7dd3fc", background: "none", border: "none", cursor: "pointer" }}>
            Try again
          </button>
        </div>
      )}

      {!loading && !error && mergedFeedItems.length === 0 && (
        <div
          className="ice-glass-soft"
          style={{
            textAlign: "center",
            padding: "2.5rem 1rem",
            color: "#64748b",
            borderStyle: "dashed",
          }}
        >
          {isSearch ? (
            <p>No posts matched your search.</p>
          ) : filterMode === "following" ? (
            <>
              <p style={{ fontSize: "1.05rem", marginBottom: "0.4rem" }}>No posts in your categories</p>
              <p style={{ fontSize: "0.9rem" }}>
                {followed.length
                  ? `Following: ${followed.join(", ")}`
                  : "Choose categories in Profile to filter the feed."}
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: "1.1rem", marginBottom: "0.4rem" }}>No posts yet</p>
              <p style={{ fontSize: "0.9rem" }}>Be the first to say something.</p>
            </>
          )}
        </div>
      )}

      {!loading &&
        !error &&
        mergedFeedItems.map((item) =>
          item.kind === "lite" ? (
            <LitePostCard key={item.post.id} post={item.post} />
          ) : (
            <PostCard
              key={item.post.id.toString()}
              post={item.post}
              category={categoryMap[item.post.id.toString()] || DEFAULT_CATEGORY}
              actor={actor}
              currentUserPrincipal={currentUserPrincipal}
              onUserClick={onUserClick}
              onDeleted={(id) =>
                setPosts((prev) => prev.filter((p) => p.id.toString() !== id.toString()))
              }
              onUpdated={(updated) =>
                setPosts((prev) =>
                  prev.map((p) =>
                    p.id.toString() === updated.id.toString()
                      ? { ...p, content: updated.content }
                      : p
                  )
                )
              }
            />
          )
        )}
    </div>
  );
}
