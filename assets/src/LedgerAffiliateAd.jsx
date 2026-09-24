import React from "react";

/** Official affiliate shop link (FrostedBlocks). */
export const LEDGER_AFFILIATE_URL = "https://shop.ledger.com/?r=0db9bdf6c4e3";

/**
 * Compact Ledger affiliate chip — dark frosted glass.
 * `compact` kept for API compatibility (always compact now).
 */
export default function LedgerAffiliateAd({ compact: _compact = true }) {
  return (
    <a
      href={LEDGER_AFFILIATE_URL}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="ice-ledger-ad ice-aff-card"
      style={styles.card}
      aria-label="Shop Ledger hardware wallets (affiliate link)"
    >
      <span style={styles.icon} aria-hidden>
        <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
          <rect x="8" y="12" width="32" height="24" rx="3" stroke="#e2e8f0" strokeWidth="2" />
          <rect x="16" y="18" width="16" height="10" rx="1.5" stroke="#4ade80" strokeWidth="1.5" />
          <circle cx="24" cy="23" r="2" fill="#4ade80" />
        </svg>
      </span>
      <span style={styles.text}>
        <span style={styles.name}>Ledger</span>
        <span style={styles.desc}>Cold wallet · self-custody</span>
      </span>
      <span style={{ ...styles.cta, ...styles.ctaGreen }}>Shop →</span>
    </a>
  );
}

const styles = {
  card: {
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
    textDecoration: "none",
    color: "inherit",
    padding: "0.55rem 0.7rem",
    borderRadius: 10,
    border: "1px solid rgba(74, 222, 128, 0.28)",
    background: "rgba(18, 20, 32, 0.65)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    minWidth: 0,
    flex: "1 1 200px",
  },
  icon: {
    flexShrink: 0,
    width: 28,
    height: 28,
    borderRadius: 7,
    display: "grid",
    placeItems: "center",
    background: "rgba(0,0,0,0.4)",
    border: "1px solid rgba(74,222,128,0.3)",
  },
  text: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: "0.05rem",
  },
  name: {
    fontSize: "0.78rem",
    fontWeight: 700,
    color: "#f8fafc",
    lineHeight: 1.2,
  },
  desc: {
    fontSize: "0.65rem",
    color: "#94a3b8",
    lineHeight: 1.2,
  },
  cta: {
    flexShrink: 0,
    fontSize: "0.68rem",
    fontWeight: 800,
    padding: "0.28rem 0.55rem",
    borderRadius: 999,
    whiteSpace: "nowrap",
  },
  ctaGreen: {
    color: "#052e16",
    background: "linear-gradient(90deg, #4ade80, #86efac)",
  },
};
