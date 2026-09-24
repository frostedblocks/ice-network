/**
 * Shared inline style tokens for components still using style={{}}.
 * Prefer theme.css utility classes when practical.
 */

export const colors = {
  bg: "#07070b",
  text: "#e2e8f0",
  bright: "#f8fafc",
  muted: "#94a3b8",
  dim: "#64748b",
  faint: "#475569",
  sky: "#7dd3fc",
  indigo: "#a5b4fc",
  violet: "#c4b5fd",
  accent: "#818cf8",
  danger: "#f87171",
  success: "#4ade80",
  warn: "#fbbf24",
  border: "rgba(148, 163, 184, 0.14)",
  borderStrong: "rgba(148, 163, 184, 0.22)",
  surface: "rgba(18, 20, 32, 0.55)",
  surfaceSoft: "rgba(15, 17, 28, 0.45)",
  inputBg: "rgba(9, 9, 11, 0.65)",
};

export const glass = {
  background: colors.surface,
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: `1px solid ${colors.border}`,
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.04)",
  borderRadius: "16px",
};

export const glassSoft = {
  background: colors.surfaceSoft,
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(148, 163, 184, 0.1)",
  borderRadius: "12px",
};

export const input = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.55rem 0.75rem",
  background: colors.inputBg,
  color: colors.text,
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: "10px",
  fontSize: "0.95rem",
  fontFamily: "inherit",
};

export const label = {
  display: "block",
  color: colors.muted,
  fontSize: "0.85rem",
  marginBottom: "0.35rem",
  fontWeight: 500,
};

export const btn = {
  fontSize: "0.85rem",
  padding: "0.4rem 0.85rem",
  background: "rgba(255, 255, 255, 0.05)",
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: "8px",
  cursor: "pointer",
  fontWeight: 500,
};

export const btnPrimary = {
  padding: "0.65rem 1.35rem",
  fontSize: "0.95rem",
  border: "none",
  borderRadius: "10px",
  cursor: "pointer",
  fontWeight: 600,
  color: "#0f172a",
  background: "linear-gradient(135deg, #38bdf8 0%, #818cf8 50%, #a78bfa 100%)",
  boxShadow: "0 4px 20px rgba(129, 140, 248, 0.3)",
};

export const btnDanger = {
  fontSize: "0.85rem",
  padding: "0.4rem 0.85rem",
  background: "rgba(127, 29, 29, 0.45)",
  color: "#fecaca",
  border: "1px solid #7f1d1d",
  borderRadius: "8px",
  cursor: "pointer",
  fontWeight: 500,
};

export const btnGhost = {
  fontSize: "0.85rem",
  padding: "0.35rem 0.7rem",
  background: "rgba(255, 255, 255, 0.04)",
  color: colors.text,
  border: `1px solid ${colors.border}`,
  borderRadius: "8px",
  cursor: "pointer",
};
