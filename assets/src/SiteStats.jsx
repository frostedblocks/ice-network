import React, { useState, useEffect } from "react";

/**
 * Master-only site statistics dashboard.
 */
export default function SiteStats({ actor }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    if (!actor) return;
    setLoading(true);
    setError("");
    try {
      const result = await actor.getSiteStats();
      setStats(result || null);
    } catch (err) {
      console.error(err);
      setError("Could not load stats.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [actor]);

  const registered =
    stats && stats.registeredAccounts != null
      ? Number(stats.registeredAccounts)
      : stats
      ? Number(stats.totalProfiles || 0)
      : 0;

  const items = stats
    ? [
        { label: "Total posts", value: Number(stats.totalPosts) },
        { label: "Visible posts", value: Number(stats.visiblePosts) },
        { label: "Hidden posts", value: Number(stats.hiddenPosts) },
        { label: "Comments", value: Number(stats.totalComments) },
        { label: "Profiles", value: Number(stats.totalProfiles) },
        { label: "Accounts with balances", value: Number(stats.totalBalances) },
        { label: "Posts with reports", value: Number(stats.reportedPosts) },
        { label: "Total report flags", value: Number(stats.totalReportFlags) },
        { label: "Banned users", value: Number(stats.bannedUsers) },
      ]
    : [];

  return (
    <div className="ice-section" style={{ marginBottom: "0.5rem" }}>
      <div className="ice-stats-head">
        <h4>Network overview</h4>
        <button type="button" onClick={load} className="ice-btn ice-btn-xs">
          Refresh
        </button>
      </div>

      {loading && <p className="ice-dim" style={{ fontSize: "0.9rem" }}>Loading…</p>}
      {error && <p className="ice-inline-err">{error}</p>}

      {!loading && stats && (
        <>
          <div className="ice-stats-hero">
            <div className="ice-stats-hero-value">{registered.toLocaleString()}</div>
            <div className="ice-stats-hero-label">Registered Internet Identity accounts</div>
            <div className="ice-stats-hero-hint">
              Members who completed registration or legacy profile setup
            </div>
          </div>

          <div className="ice-stats-grid">
            {items.map((item) => (
              <div key={item.label} className="ice-stats-tile">
                <div className="ice-stats-tile-value">{item.value.toLocaleString()}</div>
                <div className="ice-stats-tile-label">{item.label}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
