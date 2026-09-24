import React, { useState, useEffect } from "react";

function e8sToIcpLabel(e8s) {
  const n = typeof e8s === "bigint" ? Number(e8s) : Number(e8s);
  if (!Number.isFinite(n)) return "0";
  const icp = n / 100_000_000;
  if (Number.isInteger(icp)) return String(icp);
  return icp.toFixed(4).replace(/\.?0+$/, "");
}

export default function TokenBalance({ actor, principal, refreshKey = 0 }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!actor || !principal) return;

    const load = async () => {
      setLoading(true);
      try {
        let icpE8s = 0;
        if (actor.getMyIcpE8s) {
          const n = await actor.getMyIcpE8s();
          icpE8s = Number(typeof n === "bigint" ? n : n ?? 0);
        }
        const result = await actor.getUserStats(principal);
        const raw =
          result == null || result === undefined
            ? null
            : Array.isArray(result)
            ? result.length > 0
              ? result[0]
              : null
            : result;
        if (raw) {
          const fromStats = Number(raw.icpE8s ?? raw.tokens ?? 0);
          setStats({
            icpE8s: actor.getMyIcpE8s ? icpE8s : fromStats,
            postsThisMonth: Number(raw.postsThisMonth),
            postsToday: Number(raw.postsToday),
            isFreeTier: !!raw.isFreeTier,
          });
        } else {
          setStats({
            icpE8s,
            postsThisMonth: 0,
            postsToday: 0,
            isFreeTier: true,
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [actor, principal, refreshKey]);

  if (loading) {
    return <span style={{ fontSize: "0.85rem", color: "#64748b" }}>…</span>;
  }

  if (!stats) return null;

  return (
    <div className="ice-chip">
      <span>
        <strong style={{ color: "#f8fafc" }}>{e8sToIcpLabel(stats.icpE8s)}</strong> ICP
      </span>
    </div>
  );
}
