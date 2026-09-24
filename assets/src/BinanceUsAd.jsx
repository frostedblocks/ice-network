import React from "react";

/** Binance.US registration affiliate link (FrostedBlocks). */
export const BINANCE_US_AFFILIATE_URL =
  "https://binance.us/universal_JHHGDSKDJ/auth/registration?ref=35305738";

/**
 * Compact Binance.US affiliate chip — dark frosted glass.
 */
export default function BinanceUsAd() {
  return (
    <a
      href={BINANCE_US_AFFILIATE_URL}
      target="_blank"
      rel="noopener noreferrer sponsored"
      className="ice-binance-ad ice-aff-card"
      style={styles.card}
      aria-label="Sign up on Binance.US (affiliate link)"
    >
      <span style={styles.icon} aria-hidden>
        <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
          <path d="M24 10 L36 24 L24 38 L12 24 Z" fill="#F0B90B" />
          <path d="M24 18 L30 24 L24 30 L18 24 Z" fill="#07070b" />
        </svg>
      </span>
      <span style={styles.text}>
        <span style={styles.name}>Binance.US</span>
        <span style={styles.desc}>Buy ICP · crypto</span>
      </span>
      <span style={{ ...styles.cta, ...styles.ctaGold }}>Sign up →</span>
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
    border: "1px solid rgba(240, 185, 11, 0.28)",
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
    border: "1px solid rgba(240,185,11,0.3)",
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
  ctaGold: {
    color: "#1a1400",
    background: "linear-gradient(90deg, #F0B90B, #F8D12F)",
  },
};
