import React, { useState, useEffect, useCallback } from "react";
import { getIceCanisterId } from "./icpLedger";
import NnsIcpFee from "./NnsIcpFee";
import useActionFees, { formatIcpFromE8s } from "./useActionFees";

const PRESETS_E8S = [
  { label: "0.01 ICP", e8s: 1_000_000n },
  { label: "0.05 ICP", e8s: 5_000_000n },
  { label: "0.1 ICP", e8s: 10_000_000n },
  { label: "0.5 ICP", e8s: 50_000_000n },
  { label: "1 ICP", e8s: 100_000_000n },
];

/**
 * Prepaid ICP balance — deposit via II approve (replaces token packs).
 */
export default function Subscribe({ actor, identity, principal, onSuccess }) {
  const [balanceE8s, setBalanceE8s] = useState(0n);
  const [selectedE8s, setSelectedE8s] = useState(10_000_000n);
  const [customIcp, setCustomIcp] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [feeReady, setFeeReady] = useState(false);
  const actionFees = useActionFees(actor);

  const e8sToIcp = (e8s) => {
    const n = typeof e8s === "bigint" ? Number(e8s) : Number(e8s);
    if (!Number.isFinite(n)) return "0";
    return (n / 100_000_000).toFixed(n % 100_000_000 === 0 ? 0 : 4);
  };

  const icpToE8s = (icp) => {
    const s = String(icp ?? "").trim();
    if (!s) return 0n;
    const parts = s.split(".");
    const whole = BigInt(parts[0] || "0");
    let frac = (parts[1] || "").replace(/\D/g, "").slice(0, 8);
    while (frac.length < 8) frac += "0";
    return whole * 100_000_000n + BigInt(frac || "0");
  };

  const load = async () => {
    if (!actor) return;
    try {
      if (actor.getMyIcpE8s) {
        const n = await actor.getMyIcpE8s();
        setBalanceE8s(typeof n === "bigint" ? n : BigInt(n ?? 0));
      } else if (principal && actor.getUserStats) {
        const raw = await actor.getUserStats(principal);
        const stats = Array.isArray(raw) ? raw[0] : raw;
        const v = stats?.icpE8s ?? stats?.tokens ?? 0;
        setBalanceE8s(typeof v === "bigint" ? v : BigInt(v || 0));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
  }, [actor, principal]);

  const amountE8s = customIcp.trim() ? icpToE8s(customIcp) : selectedE8s;
  const onFeeReady = useCallback((r) => setFeeReady(!!r), []);

  const handleDeposit = async () => {
    if (!actor?.depositIcp || !identity) return;
    if (amountE8s <= 0n) {
      setError("Choose a deposit amount greater than 0.");
      return;
    }
    if (!feeReady) {
      setError("Approve the ICP amount with Internet Identity first.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const result = await actor.depositIcp(amountE8s);
      const text = typeof result === "string" ? result : "";
      if (/^Deposited/i.test(text) || /success/i.test(text) || /Balance updated/i.test(text)) {
        setMessage(text);
        setFeeReady(false);
        await load();
        if (onSuccess) onSuccess();
      } else {
        setError(text || "Deposit failed.");
      }
    } catch (e) {
      console.error(e);
      setError(e?.message || "Deposit failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ice-glass" style={{ padding: "1.25rem", maxWidth: "32rem" }}>
      <h2 className="ice-title" style={{ marginTop: 0 }}>
        ICP balance
      </h2>
      <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5 }}>
        Deposit ICP to your balance on ICE.
      </p>

      {actionFees.anyActionFeeOn && (
        <div
          className="ice-glass-soft"
          style={{
            padding: "0.7rem 0.85rem",
            marginBottom: "0.85rem",
            fontSize: "0.8rem",
            color: "#94a3b8",
            lineHeight: 1.45,
          }}
        >
          <div style={{ color: "#7dd3fc", fontWeight: 700, fontSize: "0.72rem", marginBottom: "0.35rem" }}>
            CURRENT ACTION FEES
          </div>
          <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
            {actionFees.postFeeEnabled && (
              <li>
                Post (after free tier):{" "}
                <strong style={{ color: "#e2e8f0" }}>
                  {formatIcpFromE8s(actionFees.postFeeE8s)} ICP
                </strong>
              </li>
            )}
            {actionFees.loveFeeEnabled && (
              <li>
                Love:{" "}
                <strong style={{ color: "#e2e8f0" }}>
                  {formatIcpFromE8s(actionFees.loveFeeE8s)} ICP
                </strong>
              </li>
            )}
            {actionFees.messageFeeEnabled && (
              <li>
                Message:{" "}
                <strong style={{ color: "#e2e8f0" }}>
                  {formatIcpFromE8s(actionFees.messageFeeE8s)} ICP
                </strong>
              </li>
            )}
          </ul>
        </div>
      )}

      <div
        className="ice-glass-soft"
        style={{ padding: "0.85rem 1rem", marginBottom: "1rem" }}
      >
        <div style={{ fontSize: "0.72rem", color: "#7dd3fc", fontWeight: 700 }}>BALANCE</div>
        <div style={{ fontSize: "1.35rem", fontWeight: 750, color: "#f8fafc" }}>
          {e8sToIcp(balanceE8s)} ICP
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", margin: "0.75rem 0" }}>
        {PRESETS_E8S.map((p) => (
          <button
            key={p.label}
            type="button"
            className={!customIcp && selectedE8s === p.e8s ? "ice-btn-primary" : "ice-btn"}
            onClick={() => {
              setSelectedE8s(p.e8s);
              setCustomIcp("");
              setFeeReady(false);
            }}
            style={{ fontSize: "0.8rem" }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <label style={{ display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "0.35rem" }}>
        Custom ICP amount
      </label>
      <input
        value={customIcp}
        onChange={(e) => {
          setCustomIcp(e.target.value);
          setFeeReady(false);
        }}
        placeholder="e.g. 0.25"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "0.55rem 0.7rem",
          marginBottom: "0.75rem",
          borderRadius: 8,
          border: "1px solid rgba(148,163,184,0.25)",
          background: "rgba(9,9,11,0.7)",
          color: "#e2e8f0",
        }}
      />

      {identity && amountE8s > 0n && (
        <NnsIcpFee
          key={amountE8s.toString()}
          identity={identity}
          feeE8s={amountE8s}
          spenderCanisterId={getIceCanisterId()}
          purpose="ICP deposit"
          onReadyChange={onFeeReady}
        />
      )}

      <button
        type="button"
        className="ice-btn-primary"
        disabled={loading || !feeReady || amountE8s <= 0n || !actor?.depositIcp}
        onClick={handleDeposit}
        style={{ width: "100%", marginTop: "0.5rem", opacity: !feeReady ? 0.55 : 1 }}
      >
        {loading
          ? "Depositing…"
          : !actor?.depositIcp
          ? "Deposit unavailable — redeploy ICE"
          : `Deposit ${e8sToIcp(amountE8s)} ICP`}
      </button>

      {message && (
        <p style={{ color: "#86efac", fontSize: "0.85rem", marginTop: "0.75rem" }}>{message}</p>
      )}
      {error && (
        <p style={{ color: "#f87171", fontSize: "0.85rem", marginTop: "0.75rem" }}>{error}</p>
      )}
    </div>
  );
}
