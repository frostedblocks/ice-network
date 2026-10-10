import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createFactoryActor } from "./actors";
import { copyTextToClipboard } from "./copyText";

const COLORS = {
  bg: "#07070B",
  accent: "#7DD3FC",
  heading: "#EAF6FF",
  body: "#CBD5E1",
  muted: "#8B9BB4",
  border: "rgba(125, 211, 252, 0.22)",
  card: "rgba(9, 9, 11, 0.88)",
  danger: "#FCA5A5",
  warn: "#FCD34D",
  ok: "#86EFAC",
};

const FILTERS = [
  { value: "all", label: "All", candid: { all: null } },
  { value: "banned", label: "Banned", candid: { banned: null } },
  { value: "networkPrivate", label: "Detached", candid: { networkPrivate: null } },
  { value: "noUsername", label: "No username", candid: { noUsername: null } },
  { value: "unregistered", label: "Unregistered", candid: { unregistered: null } },
];

const PAGE_SIZE = 50;

function principalText(p) {
  if (!p) return "";
  try {
    if (typeof p.toText === "function") return p.toText();
  } catch (_) {}
  return String(p?.toString?.() ?? p ?? "");
}

function shortPrincipal(text) {
  if (!text || text.length < 12) return text || "";
  return `${text.slice(0, 5)}…${text.slice(-3)}`;
}

function badgeStyle(kind) {
  const base = {
    display: "inline-block",
    padding: "0.1rem 0.45rem",
    borderRadius: "999px",
    fontSize: "0.72rem",
    fontWeight: 600,
    letterSpacing: "0.02em",
    border: "1px solid",
  };
  if (kind === "yes") {
    return { ...base, color: COLORS.ok, borderColor: "rgba(134, 239, 172, 0.45)", background: "rgba(134, 239, 172, 0.08)" };
  }
  if (kind === "no") {
    return { ...base, color: COLORS.muted, borderColor: "rgba(139, 155, 180, 0.35)", background: "transparent" };
  }
  if (kind === "warn") {
    return { ...base, color: COLORS.warn, borderColor: "rgba(252, 211, 77, 0.45)", background: "rgba(252, 211, 77, 0.08)" };
  }
  if (kind === "danger") {
    return { ...base, color: COLORS.danger, borderColor: "rgba(252, 165, 165, 0.45)", background: "rgba(252, 165, 165, 0.08)" };
  }
  return base;
}

function YesNo({ value, yesLabel = "Yes", noLabel = "No", dangerWhenTrue = false }) {
  const kind = value ? (dangerWhenTrue ? "danger" : "yes") : "no";
  return <span style={badgeStyle(kind)}>{value ? yesLabel : noLabel}</span>;
}

/**
 * Master-only read-only account index. Canister enforces isMaster.
 */
export default function MasterAccountsIndex({ actor, identity, onOpenInUserTools }) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [offset, setOffset] = useState(0);
  const [page, setPage] = useState({ rows: [], total: 0, offset: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [siteMap, setSiteMap] = useState({}); // principal text -> "..." | siteId | "-"
  const [copied, setCopied] = useState("");
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedQuery, filter]);

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const candidFilter = useMemo(() => {
    const f = FILTERS.find((x) => x.value === filter) || FILTERS[0];
    return f.candid;
  }, [filter]);

  const load = useCallback(async () => {
    if (!actor?.adminListAccounts) {
      setError("adminListAccounts not available — upgrade ice canister.");
      setPage({ rows: [], total: 0, offset: 0 });
      return;
    }
    setLoading(true);
    setError("");
    try {
      const raw = await actor.adminListAccounts(debouncedQuery, candidFilter, BigInt(offset), BigInt(PAGE_SIZE));
      const rows = Array.isArray(raw?.rows) ? raw.rows : [];
      const total = Number(raw?.total ?? 0n);
      const off = Number(raw?.offset ?? offset);
      setPage({ rows, total, offset: off });
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load accounts.");
      setPage({ rows: [], total: 0, offset: 0 });
    } finally {
      setLoading(false);
    }
  }, [actor, debouncedQuery, candidFilter, offset]);

  useEffect(() => {
    load();
  }, [load]);

  // Lazy site lookup for visible page only
  useEffect(() => {
    let cancelled = false;
    const rows = page.rows || [];
    if (!identity || rows.length === 0) {
      setSiteMap({});
      return undefined;
    }
    const pending = {};
    rows.forEach((r) => {
      const key = principalText(r.user);
      pending[key] = "...";
    });
    setSiteMap(pending);

    (async () => {
      try {
        const factory = await createFactoryActor(identity);
        const map = {};
        await Promise.all(
          rows.map(async (r) => {
            const p = r.user;
            const key = principalText(p);
            try {
              let id = null;
              const opt = await factory.getUserCanister(p);
              id = Array.isArray(opt) ? opt[0] : opt;
              if (!id && factory.getLastSite) {
                const last = await factory.getLastSite(p);
                id = Array.isArray(last) ? last[0] : last;
              }
              map[key] = id ? (id.toText ? id.toText() : String(id)) : "-";
            } catch (_) {
              map[key] = "-";
            }
          })
        );
        if (!cancelled) setSiteMap(map);
      } catch (_) {
        if (!cancelled) {
          const map = {};
          rows.forEach((r) => {
            map[principalText(r.user)] = "-";
          });
          setSiteMap(map);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [identity, page.rows]);

  const total = page.total || 0;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + (page.rows?.length || 0), total);
  const canPrev = offset > 0;
  const canNext = offset + PAGE_SIZE < total;

  const copyPrincipal = async (pt) => {
    try {
      await copyTextToClipboard(pt);
      setCopied(pt);
      setTimeout(() => setCopied(""), 1500);
    } catch (_) {
      setError("Copy failed.");
    }
  };

  const exportCsv = () => {
    const ok = window.confirm(
      "This file contains user principals. Keep it private and don't share it with third parties."
    );
    if (!ok) return;
    const header = [
      "username",
      "formerNames",
      "principal",
      "hasProfile",
      "isRegistered",
      "isBanned",
      "isNetworkPrivate",
      "postCount",
      "bioSnippet",
      "site",
    ];
    const escape = (v) => {
      const s = String(v ?? "");
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [header.join(",")];
    for (const r of page.rows || []) {
      const pt = principalText(r.user);
      lines.push(
        [
          r.username || "",
          (r.formerNames || []).join("|"),
          pt,
          r.hasProfile ? "true" : "false",
          r.isRegistered ? "true" : "false",
          r.isBanned ? "true" : "false",
          r.isNetworkPrivate ? "true" : "false",
          String(r.postCount ?? 0),
          r.bioSnippet || "",
          siteMap[pt] && siteMap[pt] !== "..." ? siteMap[pt] : "",
        ]
          .map(escape)
          .join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ice-accounts-page-${offset}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const renderRowCards = () =>
    (page.rows || []).map((r) => {
      const pt = principalText(r.user);
      return (
        <article
          key={pt}
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: "10px",
            padding: "0.85rem 1rem",
            marginBottom: "0.65rem",
          }}
        >
          <div style={{ color: COLORS.heading, fontWeight: 700, marginBottom: "0.35rem" }}>
            {r.username ? `@${r.username}` : "—"}
          </div>
          <div style={{ color: COLORS.muted, fontSize: "0.8rem", marginBottom: "0.5rem" }}>
            {shortPrincipal(pt)}{" "}
            <button
              type="button"
              className="ice-btn"
              style={{ marginLeft: "0.35rem", padding: "0.15rem 0.45rem", fontSize: "0.75rem" }}
              aria-label="Copy principal"
              onClick={() => copyPrincipal(pt)}
            >
              {copied === pt ? "Copied" : "Copy"}
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.5rem" }}>
            <YesNo value={!!r.isRegistered} yesLabel="Registered" noLabel="Not registered" />
            <YesNo value={!!r.isBanned} yesLabel="Banned" noLabel="Not banned" dangerWhenTrue />
            <YesNo value={!!r.isNetworkPrivate} yesLabel="Detached" noLabel="Attached" dangerWhenTrue />
            <span style={badgeStyle("no")}>Posts {String(r.postCount ?? 0)}</span>
          </div>
          <div style={{ color: COLORS.body, fontSize: "0.82rem", marginBottom: "0.35rem" }}>
            Former: {(r.formerNames || []).length ? (r.formerNames || []).map((n) => `@${n}`).join(", ") : "—"}
          </div>
          <div style={{ color: COLORS.body, fontSize: "0.82rem", marginBottom: "0.35rem" }}>
            Site: {siteMap[pt] || "…"}
          </div>
          <div style={{ color: COLORS.muted, fontSize: "0.8rem", marginBottom: "0.65rem" }}>
            {r.bioSnippet || "—"}
          </div>
          {onOpenInUserTools && (
            <button
              type="button"
              className="ice-btn"
              onClick={() => onOpenInUserTools(pt)}
            >
              Open in user tools
            </button>
          )}
        </article>
      );
    });

  const renderTable = () => (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          color: COLORS.body,
          fontSize: "0.85rem",
        }}
      >
        <caption
          style={{
            captionSide: "top",
            textAlign: "left",
            color: COLORS.muted,
            padding: "0 0 0.65rem",
            fontSize: "0.8rem",
          }}
        >
          All ICE accounts (registered and profiles). Read-only master index.
        </caption>
        <thead>
          <tr style={{ color: COLORS.heading, borderBottom: `1px solid ${COLORS.border}` }}>
            <th scope="col" style={thStyle}>Username</th>
            <th scope="col" style={thStyle}>Former names</th>
            <th scope="col" style={thStyle}>Principal</th>
            <th scope="col" style={thStyle}>Registered</th>
            <th scope="col" style={thStyle}>Site</th>
            <th scope="col" style={thStyle}>Posts</th>
            <th scope="col" style={thStyle}>Banned</th>
            <th scope="col" style={thStyle}>Detached</th>
            <th scope="col" style={thStyle}>Bio snippet</th>
            <th scope="col" style={thStyle}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {(page.rows || []).map((r) => {
            const pt = principalText(r.user);
            return (
              <tr key={pt} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <td style={tdStyle}>{r.username ? `@${r.username}` : "—"}</td>
                <td style={tdStyle}>
                  {(r.formerNames || []).length
                    ? (r.formerNames || []).map((n) => `@${n}`).join(", ")
                    : "—"}
                </td>
                <td style={tdStyle}>
                  <span title={pt}>{shortPrincipal(pt)}</span>{" "}
                  <button
                    type="button"
                    className="ice-btn"
                    style={{ padding: "0.12rem 0.4rem", fontSize: "0.72rem" }}
                    aria-label="Copy principal"
                    onClick={() => copyPrincipal(pt)}
                  >
                    {copied === pt ? "Copied" : "Copy"}
                  </button>
                </td>
                <td style={tdStyle}>
                  <YesNo value={!!r.isRegistered} />
                </td>
                <td style={{ ...tdStyle, fontFamily: "ui-monospace, monospace", fontSize: "0.75rem" }}>
                  {siteMap[pt] || "…"}
                </td>
                <td style={tdStyle}>{String(r.postCount ?? 0)}</td>
                <td style={tdStyle}>
                  <YesNo value={!!r.isBanned} dangerWhenTrue />
                </td>
                <td style={tdStyle}>
                  <YesNo value={!!r.isNetworkPrivate} dangerWhenTrue />
                </td>
                <td style={{ ...tdStyle, maxWidth: "14rem" }}>{r.bioSnippet || "—"}</td>
                <td style={tdStyle}>
                  {onOpenInUserTools && (
                    <button
                      type="button"
                      className="ice-btn"
                      style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                      onClick={() => onOpenInUserTools(pt)}
                    >
                      Open in user tools
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div
      className="ice-accounts-index"
      style={{
        background: COLORS.bg,
        border: `1px solid ${COLORS.border}`,
        borderRadius: "12px",
        padding: "1rem 1.1rem 1.15rem",
      }}
    >
      <style>{`
        .ice-accounts-index input:focus-visible,
        .ice-accounts-index select:focus-visible,
        .ice-accounts-index button:focus-visible {
          outline: 2px solid ${COLORS.accent};
          outline-offset: 2px;
        }
      `}</style>
      <div style={{ marginBottom: "0.85rem" }}>
        <h4 style={{ margin: "0 0 0.25rem", color: COLORS.heading, fontSize: "1rem" }}>
          All accounts
        </h4>
        <p style={{ margin: 0, color: COLORS.muted, fontSize: "0.8rem" }}>
          Read-only index of registered users and profiles. Use “Open in user tools” for ban,
          delete, or detach actions.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.55rem",
          alignItems: "flex-end",
          marginBottom: "0.85rem",
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: "1 1 14rem" }}>
          <span style={{ color: COLORS.muted, fontSize: "0.75rem" }}>Search</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Username, former name, or principal prefix"
            style={inputStyle}
            aria-label="Search accounts"
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
          <span style={{ color: COLORS.muted, fontSize: "0.75rem" }}>Filter</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ ...inputStyle, minWidth: "10rem" }}
            aria-label="Filter accounts"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="ice-btn" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
        <button
          type="button"
          className="ice-btn"
          onClick={exportCsv}
          disabled={!page.rows?.length}
        >
          Export page CSV
        </button>
      </div>

      <div
        aria-live="polite"
        style={{ color: COLORS.accent, fontSize: "0.82rem", marginBottom: "0.65rem" }}
      >
        {loading
          ? "Loading accounts…"
          : total === 0
            ? "Showing 0 of 0"
            : `Showing ${start}–${end} of ${total}`}
      </div>

      {error && (
        <div role="alert" style={{ color: COLORS.danger, marginBottom: "0.65rem", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      {!loading && (page.rows || []).length === 0 && !error && (
        <p style={{ color: COLORS.muted, fontSize: "0.85rem" }}>No accounts match.</p>
      )}

      {isNarrow ? renderRowCards() : renderTable()}

      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          marginTop: "0.85rem",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          className="ice-btn"
          disabled={!canPrev || loading}
          onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
        >
          Prev
        </button>
        <button
          type="button"
          className="ice-btn"
          disabled={!canNext || loading}
          onClick={() => setOffset(offset + PAGE_SIZE)}
        >
          Next
        </button>
        <span style={{ color: COLORS.muted, fontSize: "0.78rem" }}>Page size {PAGE_SIZE}</span>
      </div>
    </div>
  );
}

const thStyle = {
  textAlign: "left",
  padding: "0.45rem 0.4rem",
  fontWeight: 600,
  fontSize: "0.78rem",
  whiteSpace: "nowrap",
};

const tdStyle = {
  textAlign: "left",
  padding: "0.5rem 0.4rem",
  verticalAlign: "top",
};

const inputStyle = {
  background: "#0B0B12",
  color: COLORS.heading,
  border: `1px solid ${COLORS.border}`,
  borderRadius: "8px",
  padding: "0.45rem 0.6rem",
  outline: "none",
  boxShadow: "none",
};
