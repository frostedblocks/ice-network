import React, { useCallback, useEffect, useMemo, useState } from "react";

function shortPrincipal(p) {
  const s = String(p || "");
  if (s.length <= 18) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

function statusLabel(row, threshold) {
  if (row.claimed) return { text: "Free claimed", color: "#94a3b8" };
  if (row.eligible) return { text: "Free unlocked", color: "#86efac" };
  const left = Math.max(0, threshold - Number(row.count || 0));
  return { text: `${left} to go`, color: "#fde68a" };
}

/**
 * Master-only campaign tracker: inviter leaderboard + who referred whom.
 */
export default function MasterReferralTracker({ actor }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState("inviters"); // inviters | links

  const load = useCallback(async () => {
    if (!actor?.adminGetReferralTracker) {
      setErr("adminGetReferralTracker missing — redeploy ICE canister.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const st = await actor.adminGetReferralTracker();
      if (st && st.authorized === false) {
        setErr("Not authorized — sign in with a master Internet Identity.");
        setData(null);
      } else {
        setData(st);
      }
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Could not load referral tracker.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [actor]);

  useEffect(() => {
    load();
  }, [load]);

  const threshold = Number(data?.threshold ?? 15);
  const q = filter.trim().toLowerCase();

  const inviters = useMemo(() => {
    const rows = Array.isArray(data?.inviters) ? data.inviters : [];
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.username || ""} ${r.principal || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, q]);

  const links = useMemo(() => {
    const rows = Array.isArray(data?.links) ? data.links : [];
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.newUsername || ""} ${r.newUser || ""} ${r.inviterUsername || ""} ${r.inviter || ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, q]);

  return (
    <div className="ice-panel" style={{ marginBottom: "1rem" }}>
      <div className="ice-panel-head">
        <div>
          <h3 className="ice-panel-title">Invite tracker</h3>
          <p className="ice-panel-desc">
            Paid Joins credited via <code>?ref=</code>. Threshold{" "}
            <strong style={{ color: "#e2e8f0" }}>{threshold}</strong> → free Join + site.
          </p>
        </div>
        <button type="button" className="ice-btn" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {err && <p className="ice-inline-err">{err}</p>}

      {data && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
              gap: "0.55rem",
              marginTop: "0.75rem",
            }}
          >
            {[
              { label: "Paid referrals", value: Number(data.totalPaidReferrals ?? 0) },
              { label: "Unique inviters", value: Number(data.uniqueInviters ?? 0) },
              { label: "Unlocked free", value: Number(data.unlockedCount ?? 0) },
              { label: "Free claimed", value: Number(data.claimedCount ?? 0) },
            ].map((c) => (
              <div
                key={c.label}
                style={{
                  padding: "0.65rem 0.75rem",
                  borderRadius: 10,
                  background: "rgba(0,0,0,0.28)",
                  border: "1px solid rgba(148,163,184,0.16)",
                }}
              >
                <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>{c.label}</div>
                <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#e2e8f0", marginTop: 2 }}>
                  {c.value}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginTop: "0.85rem" }}>
            <button
              type="button"
              className={`ice-tab${tab === "inviters" ? " is-active" : ""}`}
              onClick={() => setTab("inviters")}
            >
              Inviters ({inviters.length})
            </button>
            <button
              type="button"
              className={`ice-tab${tab === "links" ? " is-active" : ""}`}
              onClick={() => setTab("links")}
            >
              Who referred whom ({links.length})
            </button>
            <input
              className="ice-input-sm"
              style={{ marginLeft: "auto", minWidth: "12rem" }}
              placeholder="Filter username / principal"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          {tab === "inviters" && (
            <div style={{ marginTop: "0.75rem", overflowX: "auto" }}>
              {inviters.length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                  No paid invite credits yet. Share your <code>?ref=</code> link to start tracking.
                </p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ color: "#94a3b8", textAlign: "left" }}>
                      <th style={{ padding: "0.4rem 0.35rem" }}>Inviter</th>
                      <th style={{ padding: "0.4rem 0.35rem" }}>Paid</th>
                      <th style={{ padding: "0.4rem 0.35rem" }}>Progress</th>
                      <th style={{ padding: "0.4rem 0.35rem" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inviters.map((row) => {
                      const count = Number(row.count || 0);
                      const pct = Math.min(100, Math.round((count / Math.max(1, threshold)) * 100));
                      const st = statusLabel(row, threshold);
                      return (
                        <tr
                          key={row.principal}
                          style={{ borderTop: "1px solid rgba(148,163,184,0.12)" }}
                        >
                          <td style={{ padding: "0.55rem 0.35rem", color: "#e2e8f0" }}>
                            <div style={{ fontWeight: 600 }}>{row.username || "—"}</div>
                            <div
                              title={row.principal}
                              style={{
                                fontFamily: "ui-monospace, monospace",
                                fontSize: "0.72rem",
                                color: "#94a3b8",
                              }}
                            >
                              {shortPrincipal(row.principal)}
                            </div>
                          </td>
                          <td style={{ padding: "0.55rem 0.35rem", color: "#e2e8f0", fontWeight: 700 }}>
                            {count} / {threshold}
                          </td>
                          <td style={{ padding: "0.55rem 0.35rem", minWidth: 120 }}>
                            <div
                              style={{
                                height: 6,
                                borderRadius: 999,
                                background: "rgba(148,163,184,0.2)",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${pct}%`,
                                  height: "100%",
                                  background: row.eligible || row.claimed
                                    ? "linear-gradient(90deg,#4ade80,#86efac)"
                                    : "linear-gradient(90deg,#38bdf8,#a78bfa)",
                                }}
                              />
                            </div>
                          </td>
                          <td style={{ padding: "0.55rem 0.35rem", color: st.color }}>{st.text}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === "links" && (
            <div style={{ marginTop: "0.75rem", overflowX: "auto" }}>
              {links.length === 0 ? (
                <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>No referral links recorded yet.</p>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                  <thead>
                    <tr style={{ color: "#94a3b8", textAlign: "left" }}>
                      <th style={{ padding: "0.4rem 0.35rem" }}>New user (paid)</th>
                      <th style={{ padding: "0.4rem 0.35rem" }}>Invited by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((row) => (
                      <tr
                        key={`${row.newUser}-${row.inviter}`}
                        style={{ borderTop: "1px solid rgba(148,163,184,0.12)" }}
                      >
                        <td style={{ padding: "0.55rem 0.35rem", color: "#e2e8f0" }}>
                          <div style={{ fontWeight: 600 }}>{row.newUsername || "—"}</div>
                          <div
                            title={row.newUser}
                            style={{
                              fontFamily: "ui-monospace, monospace",
                              fontSize: "0.72rem",
                              color: "#94a3b8",
                            }}
                          >
                            {shortPrincipal(row.newUser)}
                          </div>
                        </td>
                        <td style={{ padding: "0.55rem 0.35rem", color: "#e2e8f0" }}>
                          <div style={{ fontWeight: 600 }}>{row.inviterUsername || "—"}</div>
                          <div
                            title={row.inviter}
                            style={{
                              fontFamily: "ui-monospace, monospace",
                              fontSize: "0.72rem",
                              color: "#94a3b8",
                            }}
                          >
                            {shortPrincipal(row.inviter)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {!data && !loading && !err && (
        <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>No tracker data.</p>
      )}
    </div>
  );
}
