import React from "react";
import TimeAgo from "./TimeAgo";

/**
 * Read-only card for Lite (Web2) posts shown on the ICE Network feed.
 * No likes, comments, follow, or canister writes.
 */
export default function LitePostCard({ post }) {
  const name = post.authorName || post.authorHandle || "Lite member";
  const handle = post.authorHandle || "";
  const href = post.url || "https://lite.frostedblocks.com/";

  return (
    <article
      className="ice-glass-soft"
      style={{
        padding: "1rem 1.05rem",
        marginBottom: "0.85rem",
        border: "1px solid rgba(167, 139, 250, 0.28)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "0.75rem",
          alignItems: "center",
          marginBottom: "0.55rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, color: "#e2e8f0" }}>{name}</span>
          {handle && (
            <span style={{ fontSize: "0.78rem", color: "#64748b" }}>@{handle}</span>
          )}
          <span
            style={{
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.04em",
              padding: "0.12rem 0.45rem",
              borderRadius: 999,
              border: "1px solid rgba(167, 139, 250, 0.4)",
              background: "rgba(167, 139, 250, 0.12)",
              color: "#c4b5fd",
            }}
          >
            LITE
          </span>
          <TimeAgo timestamp={post.timestamp} />
        </div>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: "0.78rem", color: "#7dd3fc", textDecoration: "none" }}
        >
          View on Lite ↗
        </a>
      </div>
      <p
        style={{
          margin: 0,
          color: "#cbd5e1",
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {post.content}
      </p>
      <p style={{ margin: "0.65rem 0 0", fontSize: "0.72rem", color: "#64748b" }}>
        Read-only on ICE Network — interact on lite.frostedblocks.com
      </p>
    </article>
  );
}
