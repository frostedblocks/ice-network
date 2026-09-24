import React, { useState, useEffect } from "react";
import { unwrapOpt } from "./candidUtils";
import { CATEGORIES, DEFAULT_CATEGORY } from "./categories";
import useActionFees, { formatIcpFromE8s } from "./useActionFees";
import { createAnonymousUserSiteActor } from "./actors";

function photoIdKey(id) {
  if (id == null) return "";
  if (typeof id === "bigint") return id.toString();
  return String(id);
}

function photoPublicUrl(photo, siteCanisterId) {
  if (!photo) return "";
  if (photo.url) return String(photo.url);
  const path = photo.path || `/photos/${photoIdKey(photo.id)}`;
  if (!siteCanisterId) return "";
  return `https://${siteCanisterId}.raw.icp0.io${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * PostForm – text + optional link to an existing public site photo (URL only).
 * Free tier: 115 chars | Paid / master: 512 chars (or limits from canister)
 */
export default function PostForm({ actor, onPostCreated, principal, siteCanisterId }) {
  const [content, setContent] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isFreeTier, setIsFreeTier] = useState(true);
  const [freeMax, setFreeMax] = useState(115);
  const [paidMax, setPaidMax] = useState(512);
  const [categories, setCategories] = useState(CATEGORIES);
  const [sitePhotos, setSitePhotos] = useState([]);
  const [attachUrl, setAttachUrl] = useState("");
  const { postFeeEnabled, postFeeE8s } = useActionFees(actor);
  const postFeeApplies = postFeeEnabled && !isFreeTier;
  const postFeeLabel = postFeeApplies ? `${formatIcpFromE8s(postFeeE8s)} ICP` : null;

  const maxLength = isFreeTier ? freeMax : paidMax;

  useEffect(() => {
    if (!actor || !principal) return;

    const loadStats = async () => {
      try {
        let master = false;
        try {
          if (actor.isOwner) {
            master = !!(await actor.isOwner(principal));
          }
        } catch (_) {
          master = false;
        }

        try {
          if (actor.getLimits) {
            const limits = await actor.getLimits();
            if (limits) {
              setFreeMax(Number(limits.freeMaxLength) || 115);
              setPaidMax(Number(limits.paidMaxLength) || 512);
            }
          }
        } catch (_) {}

        try {
          if (actor.getCategories) {
            const list = await actor.getCategories();
            if (Array.isArray(list) && list.length > 0) {
              setCategories(list);
            }
          }
        } catch (_) {}

        if (master) {
          setIsFreeTier(false);
          return;
        }

        const result = await actor.getUserStats(principal);
        const stats = Array.isArray(result) ? result[0] : result;
        if (stats) {
          setIsFreeTier(!!stats.isFreeTier);
        }
      } catch (err) {}
    };

    loadStats();
  }, [actor, principal]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!siteCanisterId) {
        setSitePhotos([]);
        setAttachUrl("");
        return;
      }
      try {
        const site = await createAnonymousUserSiteActor(siteCanisterId);
        if (!site.listPhotos) {
          if (!cancelled) setSitePhotos([]);
          return;
        }
        const list = await site.listPhotos();
        const normalized = (Array.isArray(list) ? list : [])
          .map((ph) => ({
            id: ph.id,
            url: photoPublicUrl(ph, siteCanisterId),
          }))
          .filter((ph) => ph.url);
        if (!cancelled) setSitePhotos(normalized);
      } catch (_) {
        if (!cancelled) setSitePhotos([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteCanisterId]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!content.trim()) {
      setError("Write something first.");
      return;
    }

    if (content.length > maxLength) {
      setError(`Post is too long. Limit is ${maxLength} characters.`);
      return;
    }

    if (!actor) {
      setError("Not connected to the network yet.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const imageOpt = attachUrl ? [attachUrl] : [];
      const result = await actor.makePost(content.trim(), imageOpt, category || DEFAULT_CATEGORY);
      const postId = unwrapOpt(result);

      if (postId === null || postId === undefined) {
        setError(
          postFeeApplies
            ? `Could not create post. Check daily/character limit, or deposit ICP if you need ${postFeeLabel} for this post.`
            : "Could not create post. Check daily limit, character limit, or try again."
        );
      } else {
        setContent("");
        setCategory(DEFAULT_CATEGORY);
        setAttachUrl("");
        setSuccess("Posted. It should appear on the feed for all devices.");
        if (onPostCreated) onPostCreated(postId);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Something went wrong while posting.");
    } finally {
      setLoading(false);
    }
  };

  const remaining = maxLength - content.length;
  const counterColor = remaining < 20 ? "#f87171" : remaining < 50 ? "#fbbf24" : "#64748b";

  return (
    <form onSubmit={handleSubmit} className="ice-glass" style={{ marginBottom: "1.5rem", padding: "1rem" }}>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={
          isFreeTier
            ? `What's on your mind? (${freeMax} characters on free tier)`
            : "What's on your mind?"
        }
        rows={3}
        maxLength={maxLength}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "0.75rem",
          resize: "vertical",
          fontFamily: "inherit",
          fontSize: "0.95rem",
          lineHeight: 1.5,
        }}
      />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.6rem",
          marginTop: "0.55rem",
        }}
      >
        <label style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontSize: "0.85rem", color: "#94a3b8" }}>
          <span>Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={loading}
            style={{
              background: "rgba(9, 9, 11, 0.72)",
              color: "#e2e8f0",
              border: "1px solid rgba(148, 163, 184, 0.28)",
              borderRadius: "8px",
              padding: "0.35rem 0.55rem",
              fontSize: "0.85rem",
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div style={{ fontSize: "0.8rem", color: counterColor }}>
          {content.length} / {maxLength}
          {isFreeTier && (
            <span style={{ marginLeft: "0.5rem", color: "#64748b" }}>(Free tier)</span>
          )}
        </div>
      </div>

      {siteCanisterId && sitePhotos.length > 0 && (
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
            marginTop: "0.75rem",
            fontSize: "0.85rem",
            color: "#94a3b8",
          }}
        >
          <span>Attach site photo (public URL link only — optional)</span>
          <select
            value={attachUrl}
            onChange={(e) => setAttachUrl(e.target.value)}
            disabled={loading}
            style={{
              background: "rgba(9, 9, 11, 0.72)",
              color: "#e2e8f0",
              border: "1px solid rgba(148, 163, 184, 0.28)",
              borderRadius: "8px",
              padding: "0.4rem 0.55rem",
              fontSize: "0.85rem",
              fontFamily: "inherit",
            }}
          >
            <option value="">No photo</option>
            {sitePhotos.map((ph) => (
              <option key={photoIdKey(ph.id)} value={ph.url}>
                Photo #{photoIdKey(ph.id)}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <p style={{ color: "#f87171", marginTop: "0.75rem" }}>{error}</p>
      )}
      {success && (
        <p style={{ color: "#4ade80", marginTop: "0.75rem" }}>{success}</p>
      )}

      {postFeeApplies && (
        <p style={{ margin: "0.65rem 0 0", fontSize: "0.8rem", color: "#94a3b8" }}>
          This post costs <strong style={{ color: "#e2e8f0" }}>{postFeeLabel}</strong> from your
          prepaid ICP balance.
        </p>
      )}

      <button
        type="submit"
        className="ice-btn-primary"
        disabled={loading || !content.trim()}
        style={{ marginTop: "1rem" }}
      >
        {loading ? "Posting…" : postFeeApplies ? `Post (${postFeeLabel})` : "Post"}
      </button>
    </form>
  );
}
