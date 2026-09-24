import React, { useState } from "react";
import { Principal } from "@dfinity/principal";
import { createFactoryActor } from "./actors";

/**
 * Master-only: search II users by username or principal.
 */
export default function MasterUserSearch({
  actor,
  identity,
  onUsePrincipal,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [siteMap, setSiteMap] = useState({}); // principal text -> site canister text
  const [markUsername, setMarkUsername] = useState("");
  /** II principal mismatch: migrate membership from → to */
  const [migrateFrom, setMigrateFrom] = useState("");
  const [migrateTo, setMigrateTo] = useState("");
  /** Reassign site canister to a different II */
  const [reassignSite, setReassignSite] = useState("");
  const [reassignOwner, setReassignOwner] = useState("");

  const runSearch = async (e) => {
    e?.preventDefault?.();
    if (!actor || !query.trim()) return;
    setLoading(true);
    setError("");
    setResults([]);
    setSiteMap({});

    const q = query.trim();
    try {
      let list = [];

      if (actor.adminSearchUsers) {
        const raw = await actor.adminSearchUsers(q, 20);
        // `tokens` on AdminUserInfo is prepaid ICP e8s under the ICP economy.
        list = (raw || []).map((u) => ({
          ...u,
          icpE8s: u.icpE8s ?? u.tokens ?? 0,
        }));
      } else if (actor.adminLookupUser) {
        const one = await actor.adminLookupUser(q);
        const unwrapped = Array.isArray(one) ? one[0] : one;
        list = unwrapped ? [unwrapped] : [];
      } else {
        // Fallback: principal or exact username
        try {
          const p = Principal.fromText(q);
          const [profile, reg, banned, stats] = await Promise.all([
            actor.getProfile(p),
            actor.isRegistered(p),
            actor.isBanned ? actor.isBanned(p) : Promise.resolve(false),
            actor.getUserStats(p),
          ]);
          const pr = Array.isArray(profile) ? profile[0] : profile;
          const st = Array.isArray(stats) ? stats[0] : stats;
          list = [
            {
              user: p,
              username: pr?.username || "",
              bio: pr?.bio || "",
              isRegistered: !!reg,
              isBanned: !!banned,
              icpE8s: st?.icpE8s ?? st?.tokens ?? 0,
              postsThisMonth: st?.postsThisMonth ?? 0,
              postsToday: st?.postsToday ?? 0,
              isFreeTier: st?.isFreeTier ?? true,
            },
          ];
        } catch {
          const opt = await actor.getPrincipalByUsername(q);
          const p = Array.isArray(opt) ? opt[0] : opt;
          if (!p) {
            setError("No user found.");
            setLoading(false);
            return;
          }
          const [profile, reg, banned, stats] = await Promise.all([
            actor.getProfile(p),
            actor.isRegistered(p),
            actor.isBanned ? actor.isBanned(p) : Promise.resolve(false),
            actor.getUserStats(p),
          ]);
          const pr = Array.isArray(profile) ? profile[0] : profile;
          const st = Array.isArray(stats) ? stats[0] : stats;
          list = [
            {
              user: p,
              username: pr?.username || "",
              bio: pr?.bio || "",
              isRegistered: !!reg,
              isBanned: !!banned,
              icpE8s: st?.icpE8s ?? st?.tokens ?? 0,
              postsThisMonth: st?.postsThisMonth ?? 0,
              postsToday: st?.postsToday ?? 0,
              isFreeTier: st?.isFreeTier ?? true,
            },
          ];
        }
      }

      const arr = Array.isArray(list) ? list : [];
      setResults(arr);

      // Personal site canisters from factory (linked first, then lastSite fallback)
      if (identity && arr.length) {
        try {
          const factory = await createFactoryActor(identity);
          const map = {};
          await Promise.all(
            arr.map(async (u) => {
              const p = u.user;
              const key = p?.toText?.() || String(p);
              try {
                let id = null;
                let linked = false;
                const opt = await factory.getUserCanister(p);
                id = Array.isArray(opt) ? opt[0] : opt;
                if (id) linked = true;
                if (!id && factory.getLastSite) {
                  const last = await factory.getLastSite(p);
                  id = Array.isArray(last) ? last[0] : last;
                }
                if (id) {
                  map[key] = {
                    siteId: id.toText ? id.toText() : String(id),
                    linked,
                  };
                }
              } catch (_) {
                /* ignore */
              }
            })
          );
          setSiteMap(map);
        } catch (_) {
          /* factory optional */
        }
      }

      if (arr.length === 0) setError("No users matched.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Search failed.");
    } finally {
      setLoading(false);
    }
  };

  const principalText = (u) => {
    const p = u.user;
    return p?.toText?.() || String(p);
  };

  return (
    <div
      style={{
        marginBottom: "1.5rem",
        padding: "0.9rem 1rem",
        background: "rgba(9, 9, 11, 0.72)",
        borderRadius: "8px",
        border: "1px solid rgba(251, 191, 36, 0.28)",
      }}
    >
      <h4 style={{ margin: "0 0 0.35rem 0", color: "#fbbf24", fontSize: "0.95rem" }}>
        II user search
      </h4>
      <p style={{ margin: "0 0 0.75rem 0", color: "#64748b", fontSize: "0.8rem" }}>
        Search by username or II principal. Join only for brand-new IIs. Use recovery tools for
        wrong-principal / paid-but-missing-site cases. Always log in at the same app origin so II
        principals stay stable.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.75rem" }}>
        {actor.adminRegisterAllExistingUsers && (
          <button
            type="button"
            className="ice-btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg("");
              setError("");
              try {
                const r = await actor.adminRegisterAllExistingUsers();
                setMsg(typeof r === "string" ? r : "Done.");
              } catch (e) {
                setError(e?.message || "Migration failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Register all existing IIs (no fee)
          </button>
        )}
        {identity && (
          <button
            type="button"
            className="ice-btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg("");
              setError("");
              try {
                const factory = await createFactoryActor(identity);
                if (!factory.adminReconcileRegistry) {
                  setError("adminReconcileRegistry not available — redeploy factory.");
                  return;
                }
                const r = await factory.adminReconcileRegistry();
                setMsg(typeof r === "string" ? r : "Registry reconciled.");
              } catch (e) {
                setError(e?.message || "Reconcile failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Reconcile Registry
          </button>
        )}
      </div>

      {/* II principal mismatch recovery */}
      <div
        className="ice-glass-soft"
        style={{
          padding: "0.75rem 0.85rem",
          marginBottom: "0.85rem",
          border: "1px solid rgba(148, 163, 184, 0.18)",
        }}
      >
        <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#e2e8f0", marginBottom: "0.35rem" }}>
          Principal mismatch recovery
        </div>
        <p style={{ margin: "0 0 0.55rem", fontSize: "0.75rem", color: "#64748b", lineHeight: 1.4 }}>
          Copy ICE membership to a new II (no Join fee). Then reassign their site canister if needed.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.45rem" }}>
          <input
            type="text"
            value={migrateFrom}
            onChange={(e) => setMigrateFrom(e.target.value)}
            placeholder="From II (old principal)"
            style={inputMini}
          />
          <input
            type="text"
            value={migrateTo}
            onChange={(e) => setMigrateTo(e.target.value)}
            placeholder="To II (new principal)"
            style={inputMini}
          />
          <button
            type="button"
            className="ice-btn"
            disabled={busy || !migrateFrom.trim() || !migrateTo.trim()}
            onClick={async () => {
              if (!actor.adminMigrateMembership) {
                setError("adminMigrateMembership not available — redeploy ice.");
                return;
              }
              setBusy(true);
              setMsg("");
              setError("");
              try {
                const r = await actor.adminMigrateMembership(
                  Principal.fromText(migrateFrom.trim()),
                  Principal.fromText(migrateTo.trim())
                );
                setMsg(typeof r === "string" ? r : "Migrated.");
              } catch (e) {
                setError(e?.message || "Migrate failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Migrate membership
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          <input
            type="text"
            value={reassignSite}
            onChange={(e) => setReassignSite(e.target.value)}
            placeholder="Site canister id"
            style={inputMini}
          />
          <input
            type="text"
            value={reassignOwner}
            onChange={(e) => setReassignOwner(e.target.value)}
            placeholder="New owner II"
            style={inputMini}
          />
          <button
            type="button"
            className="ice-btn"
            disabled={busy || !reassignSite.trim() || !reassignOwner.trim()}
            onClick={async () => {
              setBusy(true);
              setMsg("");
              setError("");
              try {
                const factory = await createFactoryActor(identity);
                if (!factory.adminReassignSite) {
                  setError("adminReassignSite not available — redeploy factory.");
                  return;
                }
                const r = await factory.adminReassignSite(
                  Principal.fromText(reassignSite.trim()),
                  Principal.fromText(reassignOwner.trim())
                );
                setMsg(typeof r === "string" ? r : "Site reassigned.");
              } catch (e) {
                setError(e?.message || "Reassign failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Reassign site
          </button>
        </div>
      </div>

      <label style={{ display: "block", color: "#64748b", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
        Username when marking registered (optional)
      </label>
      <input
        type="text"
        value={markUsername}
        onChange={(e) => setMarkUsername(e.target.value)}
        placeholder="e.g. alice"
        style={{
          width: "100%",
          boxSizing: "border-box",
          marginBottom: "0.65rem",
          padding: "0.45rem 0.65rem",
          background: "rgba(9, 9, 11, 0.85)",
          color: "#e2e8f0",
          border: "1px solid rgba(148, 163, 184, 0.25)",
          borderRadius: "8px",
          fontFamily: "inherit",
          fontSize: "0.85rem",
        }}
      />

      <form onSubmit={runSearch} style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Username or principal (e.g. 4jitt-… or alice)"
          style={{
            flex: "1 1 220px",
            minWidth: "180px",
            padding: "0.5rem 0.65rem",
            background: "rgba(9, 9, 11, 0.85)",
            color: "#e2e8f0",
            border: "1px solid rgba(148, 163, 184, 0.25)",
            borderRadius: "8px",
            fontFamily: "inherit",
            fontSize: "0.9rem",
          }}
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          style={{
            padding: "0.5rem 1rem",
            background: "#fbbf24",
            color: "#07070b",
            border: "none",
            borderRadius: "8px",
            fontWeight: 700,
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {error && (
        <p style={{ color: "#f87171", fontSize: "0.85rem", marginTop: "0.65rem" }}>{error}</p>
      )}
      {msg && (
        <p style={{ color: "#4ade80", fontSize: "0.85rem", marginTop: "0.65rem" }}>{msg}</p>
      )}

      {results.length > 0 && (
        <div style={{ marginTop: "0.85rem", display: "flex", flexDirection: "column", gap: "0.65rem" }}>
          {results.map((u) => {
            const pt = principalText(u);
            const siteInfo = siteMap[pt];
            const site = siteInfo?.siteId || (typeof siteInfo === "string" ? siteInfo : null);
            return (
              <div
                key={pt}
                style={{
                  padding: "0.75rem 0.85rem",
                  borderRadius: "8px",
                  border: "1px solid rgba(148, 163, 184, 0.18)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ color: "#f8fafc", fontWeight: 600 }}>
                      {u.username || "(no username)"}
                      {u.isBanned ? (
                        <span style={{ marginLeft: "0.4rem", color: "#f87171", fontSize: "0.75rem" }}>
                          BANNED
                        </span>
                      ) : null}
                      {!u.isRegistered ? (
                        <span style={{ marginLeft: "0.4rem", color: "#fbbf24", fontSize: "0.75rem" }}>
                          not registered
                        </span>
                      ) : null}
                    </div>
                    {u.bio ? (
                      <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: "0.2rem" }}>{u.bio}</div>
                    ) : null}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8", textAlign: "right" }}>
                    <div>
                      {(() => {
                        const n = Number(u.icpE8s ?? u.tokens ?? 0) / 100_000_000;
                        if (!Number.isFinite(n)) return "0 ICP prepaid";
                        const label = Number.isInteger(n)
                          ? String(n)
                          : n.toFixed(4).replace(/\.?0+$/, "");
                        return `${label} ICP prepaid`;
                      })()}
                    </div>
                    <div>
                      posts {Number(u.postsToday ?? 0)}/day · {Number(u.postsThisMonth ?? 0)}/mo
                      {u.isFreeTier ? " · free tier" : ""}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: "0.5rem",
                    fontFamily: "ui-monospace, Menlo, monospace",
                    fontSize: "0.72rem",
                    color: "#7dd3fc",
                    wordBreak: "break-all",
                  }}
                >
                  II: {pt}
                </div>

                {siteInfo && (
                  <div
                    style={{
                      marginTop: "0.35rem",
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: "0.72rem",
                      color: siteInfo.linked ? "#86efac" : "#fbbf24",
                      wordBreak: "break-all",
                    }}
                  >
                    Site canister ({siteInfo.linked ? "linked" : "last site"}):{" "}
                    {siteInfo.siteId}
                  </div>
                )}

                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.65rem" }}>
                  <button
                    type="button"
                    className="ice-btn"
                    onClick={() => {
                      navigator.clipboard?.writeText(pt);
                    }}
                  >
                    Copy II
                  </button>
                  {site && (
                    <button
                      type="button"
                      className="ice-btn"
                      onClick={() => navigator.clipboard?.writeText(site)}
                    >
                      Copy site ID
                    </button>
                  )}
                  {onUsePrincipal && (
                    <button type="button" className="ice-btn" onClick={() => onUsePrincipal(pt)}>
                      Use for grant/remove
                    </button>
                  )}
                  <button
                    type="button"
                    className="ice-btn"
                    onClick={() => {
                      setMigrateFrom(pt);
                      if (site) setReassignSite(site);
                    }}
                  >
                    Use for migrate
                  </button>
                  {actor.adminMarkRegistered && (
                    <button
                      type="button"
                      className="ice-btn-primary"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Mark this II registered with NO fee?\n${pt}\nUsername (optional): ${markUsername || u.username || "(keep/none)"}`
                          )
                        ) {
                          return;
                        }
                        setBusy(true);
                        setMsg("");
                        setError("");
                        try {
                          const uname = (markUsername || u.username || "").trim();
                          const result = await actor.adminMarkRegistered(
                            Principal.fromText(pt),
                            uname,
                            u.bio || ""
                          );
                          setMsg(typeof result === "string" ? result : "Marked registered.");
                          await runSearch();
                        } catch (e) {
                          setError(e?.message || "Mark registered failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Mark registered (no fee)
                    </button>
                  )}
                  {identity && (
                    <button
                      type="button"
                      className="ice-btn"
                      disabled={busy}
                      title="Create personal site if Join succeeded but mint failed"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Provision / ensure website for this II (no Join fee)?\n${pt}`
                          )
                        ) {
                          return;
                        }
                        setBusy(true);
                        setMsg("");
                        setError("");
                        try {
                          const factory = await createFactoryActor(identity);
                          const fn =
                            factory.adminProvisionSite || factory.adminCreateUserSite;
                          if (!fn) {
                            setError("adminProvisionSite not available — redeploy factory.");
                            return;
                          }
                          const result = await fn.call(
                            factory,
                            Principal.fromText(pt)
                          );
                          if (result && "ok" in result) {
                            const sid = result.ok?.toText?.() || String(result.ok);
                            setMsg(`Site ready: ${sid}`);
                            await runSearch();
                          } else {
                            setError((result && result.err) || "Provision failed");
                          }
                        } catch (e) {
                          setError(e?.message || "Provision failed");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Provision site (no fee)
                    </button>
                  )}
                  {site && (
                    <a
                      href={`https://a4gq6-oaaaa-aaaab-qaa4q-cai.raw.icp0.io/?id=${site}`}
                      target="_blank"
                      rel="noreferrer"
                      className="ice-btn"
                      style={{ textDecoration: "none" }}
                    >
                      Open site Candid
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputMini = {
  flex: "1 1 160px",
  minWidth: "140px",
  padding: "0.4rem 0.55rem",
  background: "rgba(9, 9, 11, 0.85)",
  color: "#e2e8f0",
  border: "1px solid rgba(148, 163, 184, 0.25)",
  borderRadius: "8px",
  fontFamily: "ui-monospace, Menlo, monospace",
  fontSize: "0.75rem",
};
