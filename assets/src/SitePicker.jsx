import React, { useMemo, useState } from "react";

const STORAGE_PREFIX = "ice-preferred-site:";

export function preferredSiteKey(principalText) {
  return `${STORAGE_PREFIX}${principalText || ""}`;
}

export function readPreferredSite(principalText) {
  try {
    return localStorage.getItem(preferredSiteKey(principalText)) || "";
  } catch {
    return "";
  }
}

export function writePreferredSite(principalText, siteId) {
  try {
    if (!principalText || !siteId) return;
    localStorage.setItem(preferredSiteKey(principalText), siteId);
  } catch {
    /* ignore */
  }
}

function shortId(id) {
  const s = String(id || "");
  if (s.length <= 18) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

/**
 * Post-login modal when the II owns 2+ factory sites.
 */
export default function SitePicker({ sites, principalText, onSelect, onSkip }) {
  const saved = useMemo(() => readPreferredSite(principalText), [principalText]);
  const [selected, setSelected] = useState(() => {
    if (saved && sites.some((s) => s === saved)) return saved;
    return sites[0] || "";
  });

  if (!sites?.length) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ice-site-picker-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        className="ice-glass"
        style={{
          maxWidth: 440,
          width: "100%",
          padding: "1.25rem 1.35rem",
          border: "1px solid rgba(125,211,252,0.28)",
        }}
      >
        <h2 id="ice-site-picker-title" style={{ margin: "0 0 0.35rem", color: "#f8fafc", fontSize: "1.15rem" }}>
          Which website?
        </h2>
        <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#94a3b8", lineHeight: 1.45 }}>
          This Internet Identity owns more than one personal site. Choose which one to use for My
          Site this session.
        </p>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {sites.map((id) => {
            const active = selected === id;
            return (
              <li key={id} style={{ marginBottom: "0.45rem" }}>
                <button
                  type="button"
                  onClick={() => setSelected(id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "0.65rem 0.75rem",
                    borderRadius: 10,
                    border: active
                      ? "1px solid rgba(125,211,252,0.55)"
                      : "1px solid rgba(148,163,184,0.22)",
                    background: active ? "rgba(56,189,248,0.12)" : "rgba(9,9,11,0.55)",
                    color: "#e2e8f0",
                    cursor: "pointer",
                    fontFamily: "ui-monospace, monospace",
                    fontSize: "0.8rem",
                  }}
                >
                  {shortId(id)}
                  {saved === id ? (
                    <span style={{ marginLeft: 8, color: "#7dd3fc", fontSize: "0.72rem" }}>
                      (last used)
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="ice-btn-primary"
            disabled={!selected}
            onClick={() => onSelect(selected)}
          >
            Continue
          </button>
          {typeof onSkip === "function" && (
            <button type="button" className="ice-btn" onClick={onSkip}>
              Skip for now
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
