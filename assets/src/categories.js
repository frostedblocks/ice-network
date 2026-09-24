/** Fixed post categories — must match backend VALID_CATEGORIES */
export const CATEGORIES = [
  "General",
  "Tech",
  "Crypto",
  "Life",
  "Ideas",
  "News",
  "Art",
  "Sports",
  "Questions",
  "Random",
];

export const DEFAULT_CATEGORY = "General";

/** Soft badge colors for frosted UI */
export const CATEGORY_COLORS = {
  General: { bg: "rgba(148, 163, 184, 0.16)", border: "rgba(148, 163, 184, 0.35)", color: "#cbd5e1" },
  Tech: { bg: "rgba(56, 189, 248, 0.14)", border: "rgba(56, 189, 248, 0.4)", color: "#7dd3fc" },
  Crypto: { bg: "rgba(251, 191, 36, 0.14)", border: "rgba(251, 191, 36, 0.4)", color: "#fcd34d" },
  Life: { bg: "rgba(52, 211, 153, 0.14)", border: "rgba(52, 211, 153, 0.4)", color: "#6ee7b7" },
  Ideas: { bg: "rgba(167, 139, 250, 0.14)", border: "rgba(167, 139, 250, 0.4)", color: "#c4b5fd" },
  News: { bg: "rgba(248, 113, 113, 0.12)", border: "rgba(248, 113, 113, 0.35)", color: "#fca5a5" },
  Art: { bg: "rgba(244, 114, 182, 0.14)", border: "rgba(244, 114, 182, 0.4)", color: "#f9a8d4" },
  Sports: { bg: "rgba(74, 222, 128, 0.12)", border: "rgba(74, 222, 128, 0.35)", color: "#86efac" },
  Questions: { bg: "rgba(96, 165, 250, 0.14)", border: "rgba(96, 165, 250, 0.4)", color: "#93c5fd" },
  Random: { bg: "rgba(251, 146, 60, 0.12)", border: "rgba(251, 146, 60, 0.35)", color: "#fdba74" },
};

export function categoryStyle(name) {
  return CATEGORY_COLORS[name] || CATEGORY_COLORS.General;
}
