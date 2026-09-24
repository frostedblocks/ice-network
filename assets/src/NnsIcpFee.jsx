import React, { useState, useEffect, useCallback } from "react";
import {
  approveIcpSpend,
  getIcpBalanceE8s,
  formatIcp,
  ICP_FEE_E8S,
} from "./icpLedger";

/**
 * ICP fee panel: pay with Internet Identity; fund that II from NNS if needed.
 *
 * 1) Log in with II (already done)
 * 2) If liquid balance is low, send ICP from NNS → this II principal (not a neuron)
 * 3) Approve with II (icrc2_approve) — II confirms the transaction
 * 4) Parent calls register / deposit / detach / relink (canister transfer_from)
 *
 * Used for join fee, ICP deposit, tips — not shown as post/love/message fees.
 *
 * @param {object} props
 * @param {object} props.identity - II identity
 * @param {bigint|number} props.feeE8s
 * @param {string} props.spenderCanisterId - ICE or factory canister id (spender)
 * @param {string} [props.purpose]
 * @param {(ready: boolean) => void} [props.onReadyChange]
 */
export default function NnsIcpFee({
  identity,
  feeE8s,
  spenderCanisterId,
  purpose = "fee",
  onReadyChange,
}) {
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [err, setErr] = useState("");
  const [hint, setHint] = useState("");

  const me = identity?.getPrincipal?.();
  const principalText = me?.toText?.() || "";
  const fee = typeof feeE8s === "bigint" ? feeE8s : BigInt(feeE8s || 0);
  // approve fee + transfer amount + transfer fee
  const need = fee + ICP_FEE_E8S + ICP_FEE_E8S;
  const funded = balance != null && balance >= need;
  const ready = approved;

  const refresh = useCallback(async () => {
    if (!identity) return;
    setLoading(true);
    setErr("");
    try {
      const bal = await getIcpBalanceE8s(identity);
      setBalance(typeof bal === "bigint" ? bal : BigInt(bal));
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Could not read ICP balance on this Internet Identity");
    } finally {
      setLoading(false);
    }
  }, [identity]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    setApproved(false);
  }, [String(fee), spenderCanisterId, principalText]);

  useEffect(() => {
    if (onReadyChange) onReadyChange(ready);
  }, [ready, onReadyChange]);

  const openNnsFund = async () => {
    setHint("");
    try {
      if (principalText) await navigator.clipboard?.writeText(principalText);
      setHint(
        "Your II principal was copied. In NNS: Send liquid ICP to that principal (main account, not a neuron). Then come back and Refresh."
      );
    } catch (_) {
      setHint("Copy your II principal below, then in NNS send liquid ICP to it.");
    }
    window.open("https://nns.ic0.app/tokens", "_blank", "noopener,noreferrer");
  };

  const handleApprove = async () => {
    if (!identity || !spenderCanisterId || !fee) return;
    setApproving(true);
    setErr("");
    setHint("");
    try {
      await approveIcpSpend(identity, spenderCanisterId, fee, purpose);
      setApproved(true);
      setHint("Approved with Internet Identity. Continue below to complete payment.");
      await refresh();
    } catch (e) {
      console.error(e);
      setApproved(false);
      setErr(e?.message || "Approve failed");
    } finally {
      setApproving(false);
    }
  };

  if (!fee || fee === 0n) return null;

  return (
    <div
      className="ice-glass-soft"
      style={{
        marginTop: "1rem",
        marginBottom: "1rem",
        padding: "0.9rem 1rem",
        border: ready
          ? "1px solid rgba(74, 222, 128, 0.4)"
          : "1px solid rgba(56, 189, 248, 0.35)",
      }}
    >
      <div style={{ color: "#7dd3fc", fontWeight: 700, fontSize: "0.8rem", letterSpacing: "0.04em" }}>
        OPTIONAL ICP FEE — {purpose.toUpperCase()}
      </div>
      <p style={{ margin: "0.4rem 0 0.65rem", color: "#94a3b8", fontSize: "0.8rem", lineHeight: 1.5 }}>
        This is for <strong style={{ color: "#e2e8f0" }}>{purpose}</strong>. Fund the II principal
        below from <strong style={{ color: "#e2e8f0" }}>NNS</strong> if needed, then approve.
        Nothing is charged until you approve and complete the action.
      </p>

      <div style={{ color: "#e2e8f0", fontSize: "0.9rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        Fee: <span style={{ color: "#fbbf24" }}>{formatIcp(fee)} ICP</span>
        <span style={{ color: "#64748b", fontWeight: 400, fontSize: "0.8rem" }}>
          {" "}
          (need ~{formatIcp(need)} free on this II incl. ledger fees)
        </span>
      </div>

      {principalText && (
        <div style={{ marginBottom: "0.5rem" }}>
          <div style={{ fontSize: "0.68rem", color: "#64748b" }}>
            Your II principal (send liquid ICP here from NNS if balance is low)
          </div>
          <code
            style={{
              display: "block",
              fontSize: "0.72rem",
              color: "#f8fafc",
              wordBreak: "break-all",
              background: "rgba(0,0,0,0.35)",
              padding: "0.4rem 0.5rem",
              borderRadius: 6,
            }}
          >
            {principalText}
          </code>
        </div>
      )}

      <div
        style={{
          marginBottom: "0.65rem",
          color: funded ? "#4ade80" : "#fbbf24",
          fontSize: "0.85rem",
          fontWeight: 600,
        }}
      >
        Liquid ICP on this II:{" "}
        {balance == null ? "…" : `${formatIcp(balance)} ICP`}
        {funded ? " — enough to pay" : " — fund from NNS if needed"}
        {approved ? " · approved ✓" : ""}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button
          type="button"
          className="ice-btn"
          onClick={openNnsFund}
          style={{ fontSize: "0.85rem" }}
        >
          Open NNS to fund this II
        </button>
        <button
          type="button"
          className="ice-btn"
          disabled={loading}
          onClick={refresh}
          style={{ fontSize: "0.85rem" }}
        >
          {loading ? "Checking…" : "Refresh balance"}
        </button>
        <button
          type="button"
          className="ice-btn-primary"
          disabled={approving || !spenderCanisterId}
          onClick={handleApprove}
          style={{ fontSize: "0.85rem" }}
        >
          {approving
            ? "Approve in II…"
            : approved
            ? "Approved — continue below"
            : `Approve ${formatIcp(fee)} ICP with II`}
        </button>
      </div>

      {hint && (
        <p style={{ margin: "0.5rem 0 0", color: "#4ade80", fontSize: "0.75rem" }}>{hint}</p>
      )}
      {err && (
        <p style={{ margin: "0.5rem 0 0", color: "#f87171", fontSize: "0.75rem" }}>{err}</p>
      )}
    </div>
  );
}
