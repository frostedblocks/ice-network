import React, { useState, useEffect } from "react";
import { unwrapOpt } from "./candidUtils";
import { publicUPath } from "./uProfile";

/**
 * Avatar + username. Shows Founder badge only when master is not cloaked.
 * When a username is known, links to /u/<username> for every visitor.
 */
export default function Username({ actor, principal, size = 28, onClick }) {
  const [profile, setProfile] = useState(null);
  const [isMasterVisible, setIsMasterVisible] = useState(false);

  useEffect(() => {
    if (!actor || !principal) return;

    const load = async () => {
      try {
        const [profileResult, visible] = await Promise.all([
          actor.getProfile(principal),
          actor.isOwnerVisible(principal),
        ]);
        const p = unwrapOpt(profileResult);
        setProfile(p && p.username ? p : null);
        setIsMasterVisible(!!visible);
      } catch (err) {
        // silent fail
      }
    };

    load();
  }, [actor, principal]);

  const name = profile?.username || null;
  // href uses normalized usernameIndex key (lowercase); display keeps original casing.
  const href = name ? publicUPath(String(name).trim().toLowerCase()) : null;

  const handleClick = (e) => {
    if (href) {
      // Real navigation to /u/ so logged-out hard refresh and share work.
      // Allow modified clicks (new tab) to use default <a> behavior.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) {
        return;
      }
      e.stopPropagation();
      return;
    }
    if (onClick) {
      e.preventDefault();
      e.stopPropagation();
      onClick(principal);
    }
  };

  const inner = (
    <>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: isMasterVisible ? "#422006" : "rgba(148, 163, 184, 0.14)",
          border: isMasterVisible ? "2px solid #fbbf24" : "1px solid rgba(148, 163, 184, 0.22)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.4,
          color: isMasterVisible ? "#fbbf24" : "#64748b",
          flexShrink: 0,
        }}
      >
        {name ? name[0].toUpperCase() : "?"}
      </div>

      {name ? (
        <span style={{ fontWeight: 500, color: isMasterVisible ? "#fde68a" : "#f8fafc" }}>
          {name}
        </span>
      ) : (
        <span style={{ color: "#94a3b8" }}>
          {principal.toString().slice(0, 10)}…
        </span>
      )}

      {isMasterVisible && (
        <span
          style={{
            fontSize: "0.65rem",
            fontWeight: 600,
            letterSpacing: "0.03em",
            color: "#07070b",
            background: "#fbbf24",
            padding: "0.1rem 0.4rem",
            borderRadius: "4px",
            textTransform: "uppercase",
          }}
        >
          Founder
        </span>
      )}
    </>
  );

  const wrapStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.45rem",
    cursor: href || onClick ? "pointer" : "default",
    textDecoration: "none",
    color: "inherit",
  };

  if (href) {
    return (
      <a href={href} onClick={handleClick} style={wrapStyle} title="View public profile">
        {inner}
      </a>
    );
  }

  return (
    <span
      onClick={handleClick}
      style={wrapStyle}
      title={onClick ? "View profile" : undefined}
      role={onClick ? "button" : undefined}
    >
      {inner}
    </span>
  );
}
