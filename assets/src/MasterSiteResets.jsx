import React, { useState, useEffect, useCallback } from "react";
import { Principal } from "@dfinity/principal";
import { createFactoryActor } from "./actors";

/**
 * Master emergency: force factory-reset any registered site canister.
 */
export default function MasterSiteResets({ identity }) {
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState([]);
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [manual, setManual] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!identity) return;
    setLoading(true);
    setErr("");
    try {
      const factory = await createFactoryActor(identity);
      let list = [];
      if (factory.listRegisteredSites) {
        list = await factory.listRegisteredSites();
      } else if (factory.listActiveCanisters) {
        const active = await factory.listActiveCanisters();
        list = (Array.isArray(active) ? active : []).map((pair) => {
          const u = Array.isArray(pair) ? pair[0] : pair;
          const c = Array.isArray(pair) ? pair[1] : pair;
          return [u, c, true];
        });
      }
      setRows(Array.isArray(list) ? list : []);
      if (factory.listPendingMints) {
        const p = await factory.listPendingMints();
        setPending(Array.isArray(p) ? p : []);
      } else {
        setPending([]);
      }
      if (factory.getResetLog) {
        const entries = await factory.getResetLog(30);
        setLog(Array.isArray(entries) ? entries : []);
      }
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Could not load registered sites");
    } finally {
      setLoading(false);
    }
  }, [identity]);

  useEffect(() => {
    load();
  }, [load]);

  const principalText = (p) => {
    try {
      return p?.toText?.() || String(p || "");
    } catch {
      return String(p || "");
    }
  };

  const forceReset = async (siteText) => {
    if (!identity || !siteText) return;
    const ok = window.confirm(
      `EMERGENCY factory reset for ${siteText}?\n\nThis permanently erases all posts, settings, pages, and custom data on that canister and restores the original factory WASM. Controllers stay the same.`
    );
    if (!ok) return;
    setBusyId(siteText);
    setMsg("");
    setErr("");
    try {
      const factory = await createFactoryActor(identity);
      if (!factory.adminForceResetSite) {
        setErr("adminForceResetSite not available — redeploy factory.");
        return;
      }
      const result = await factory.adminForceResetSite(Principal.fromText(siteText));
      if (result && "ok" in result) {
        setMsg(result.ok);
        await load();
      } else {
        setErr((result && result.err) || "Force reset failed");
      }
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Force reset failed");
    } finally {
      setBusyId("");
    }
  };

  const formatTime = (ns) => {
    try {
      const n = typeof ns === "bigint" ? Number(ns) : Number(ns);
      if (!Number.isFinite(n) || n <= 0) return "—";
      // Motoko Time.now is nanoseconds
      const ms = n / 1_000_000;
      return new Date(ms).toLocaleString();
    } catch {
      return "—";
    }
  };

  return (
    <div className="ice-profile-card ice-profile-card--nested">
      <div className="ice-profile-card-head">
        <h3>Emergency site resets</h3>
        <p>
          Force reinstall factory WASM on any registered canister. Works even if the user is offline
          or the site is broken. <strong>Factory owner only</strong> — not rate-limited (user self-reset
          is once per 24h). Factory must remain a controller. Every action is logged.
        </p>
      </div>

      {loading && <p className="ice-dim" style={{ fontSize: "0.85rem" }}>Loading…</p>}
      {err && <p className="ice-inline-err">{err}</p>}
      {msg && <p className="ice-inline-ok">{msg}</p>}

      {/* Partial mint recovery */}
      <div style={{ marginBottom: "1.15rem" }}>
        <div className="ice-section-title">Partial mints</div>
        <p style={{ margin: "0 0 0.55rem", fontSize: "0.78rem", color: "#64748b", lineHeight: 1.4 }}>
          Sites created mid-failure (install / controllers / Registry). Resume finishes the pipeline;
          abandon drops tracking only (canister may still exist).
        </p>
        {pending.length === 0 && !loading && (
          <p className="ice-dim" style={{ fontSize: "0.8rem" }}>No pending mints.</p>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem" }}>
          {pending.map((p) => {
            const siteT = principalText(p.site);
            const ownerT = principalText(p.intendedOwner);
            return (
              <div
                key={siteT}
                className="ice-glass-soft"
                style={{
                  padding: "0.7rem 0.85rem",
                  border: "1px solid rgba(251, 191, 36, 0.25)",
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "#fbbf24", fontWeight: 700 }}>
                  stage: {p.stage || "?"}
                </div>
                <code className="ice-mono" style={{ fontSize: "0.72rem", color: "#7dd3fc", display: "block", marginTop: "0.2rem" }}>
                  {siteT}
                </code>
                <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "0.2rem" }}>
                  owner: {ownerT}
                </div>
                {p.lastError ? (
                  <div style={{ fontSize: "0.72rem", color: "#f87171", marginTop: "0.25rem" }}>
                    {p.lastError}
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
                  <button
                    type="button"
                    className="ice-btn-primary"
                    disabled={!!busyId}
                    onClick={async () => {
                      setBusyId(siteT);
                      setMsg("");
                      setErr("");
                      try {
                        const factory = await createFactoryActor(identity);
                        const result = await factory.adminResumePendingMint(
                          Principal.fromText(siteT)
                        );
                        if (result && "ok" in result) {
                          setMsg(`Resumed: ${result.ok?.toText?.() || result.ok}`);
                          await load();
                        } else {
                          setErr((result && result.err) || "Resume failed");
                        }
                      } catch (e) {
                        setErr(e?.message || "Resume failed");
                      } finally {
                        setBusyId("");
                      }
                    }}
                  >
                    {busyId === siteT ? "…" : "Resume"}
                  </button>
                  <button
                    type="button"
                    className="ice-btn ice-btn-danger"
                    disabled={!!busyId}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          `Abandon pending mint tracking for ${siteT}? Canister is not deleted.`
                        )
                      ) {
                        return;
                      }
                      setBusyId(`a-${siteT}`);
                      setMsg("");
                      setErr("");
                      try {
                        const factory = await createFactoryActor(identity);
                        const r = await factory.adminAbandonPendingMint(
                          Principal.fromText(siteT)
                        );
                        setMsg(typeof r === "string" ? r : "Abandoned.");
                        await load();
                      } catch (e) {
                        setErr(e?.message || "Abandon failed");
                      } finally {
                        setBusyId("");
                      }
                    }}
                  >
                    Abandon
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.85rem" }}>
        <input
          type="text"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Canister principal to force-reset"
          style={{
            flex: "1 1 220px",
            padding: "0.55rem 0.7rem",
            background: "rgba(9, 9, 11, 0.72)",
            color: "#e2e8f0",
            border: "1px solid rgba(148, 163, 184, 0.22)",
            borderRadius: "10px",
            fontFamily: "ui-monospace, Menlo, monospace",
            fontSize: "0.8rem",
          }}
        />
        <button
          type="button"
          className="ice-btn ice-btn-danger-strong"
          disabled={!!busyId || !manual.trim()}
          onClick={() => forceReset(manual.trim())}
        >
          {busyId === manual.trim() ? "Resetting…" : "Force reset"}
        </button>
        <button type="button" className="ice-btn ice-btn-xs" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.55rem" }}>
        {rows.length === 0 && !loading && (
          <p className="ice-dim" style={{ fontSize: "0.85rem" }}>No registered sites found.</p>
        )}
        {rows.map((row) => {
          const user = Array.isArray(row) ? row[0] : row?.user;
          const site = Array.isArray(row) ? row[1] : row?.site;
          const linked = Array.isArray(row) ? !!row[2] : !!row?.linked;
          const siteT = principalText(site);
          const userT = principalText(user);
          return (
            <div
              key={siteT}
              className="ice-glass-soft"
              style={{
                padding: "0.75rem 0.9rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 200px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                  <span className={`ice-status ${linked ? "ice-status-ok" : "ice-status-muted"}`}>
                    {linked ? "Linked" : "Detached"}
                  </span>
                  <code className="ice-mono" style={{ fontSize: "0.75rem", color: "#7dd3fc" }}>
                    {siteT}
                  </code>
                </div>
                <div style={{ fontSize: "0.72rem", color: "#64748b", marginTop: "0.25rem" }}>
                  Owner II: {userT}
                </div>
              </div>
              <button
                type="button"
                className="ice-btn ice-btn-danger"
                disabled={!!busyId}
                onClick={() => forceReset(siteT)}
              >
                {busyId === siteT ? "Resetting…" : "Force reset"}
              </button>
            </div>
          );
        })}
      </div>

      {log.length > 0 && (
        <div style={{ marginTop: "1.15rem" }}>
          <div className="ice-section-title">Recent reset log</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {log
              .slice()
              .reverse()
              .map((e, i) => {
                const site = principalText(e.site);
                const by = principalText(e.triggeredBy);
                return (
                  <div
                    key={`${site}-${i}`}
                    style={{
                      fontSize: "0.75rem",
                      color: "#94a3b8",
                      padding: "0.45rem 0.55rem",
                      borderRadius: "8px",
                      background: "rgba(9, 9, 11, 0.35)",
                      border: "1px solid rgba(148, 163, 184, 0.1)",
                    }}
                  >
                    <strong style={{ color: e.kind === "emergency" ? "#fbbf24" : "#e2e8f0" }}>
                      {e.kind || "reset"}
                    </strong>{" "}
                    · {formatTime(e.at)}
                    <div className="ice-mono" style={{ color: "#7dd3fc", marginTop: "0.15rem" }}>
                      {site}
                    </div>
                    <div style={{ marginTop: "0.1rem" }}>by {by}</div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}
