import React, { useCallback, useEffect, useState } from "react";
import { Principal } from "@dfinity/principal";
import { createFactoryActor } from "./actors";

/**
 * Master emergency controls for site transfers.
 */
export default function MasterSiteTransfer({ identity }) {
  const [siteId, setSiteId] = useState("");
  const [toPrincipal, setToPrincipal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [log, setLog] = useState([]);
  const [feeIcp, setFeeIcp] = useState("0.1");
  const [recoveryReqs, setRecoveryReqs] = useState([]);
  const [identityVerified, setIdentityVerified] = useState(false);
  const [lastIssuedCode, setLastIssuedCode] = useState("");
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrationClaimed, setMigrationClaimed] = useState(0);

  const loadLog = useCallback(async () => {
    if (!identity) return;
    try {
      const factory = await createFactoryActor(identity);
      if (factory.getTransferLog) {
        const rows = await factory.getTransferLog(20);
        setLog(Array.isArray(rows) ? rows : []);
      }
      if (factory.listPendingRecoveryRequests) {
        const reqs = await factory.listPendingRecoveryRequests();
        setRecoveryReqs(Array.isArray(reqs) ? reqs : []);
      }
      if (factory.getPrincipalMigrationStatus) {
        const st = await factory.getPrincipalMigrationStatus();
        setMigrationOpen(!!st?.open);
        setMigrationClaimed(Number(st?.claimedCount ?? 0));
      }
      if (factory.getFees) {
        const fees = await factory.getFees();
        if (fees?.transferFeeE8s != null) {
          const n = Number(fees.transferFeeE8s) / 1e8;
          setFeeIcp(Number.isInteger(n) ? String(n) : String(n));
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [identity]);

  useEffect(() => {
    loadLog();
  }, [loadLog]);

  const forceTransfer = async () => {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const factory = await createFactoryActor(identity);
      const site = Principal.fromText(siteId.trim());
      const to = Principal.fromText(toPrincipal.trim());
      const result = await factory.adminForceSiteTransfer(site, to);
      if (result?.err) setErr(result.err);
      else {
        setMsg(result?.ok || "Forced transfer done");
        await loadLog();
      }
    } catch (e) {
      setErr(e?.message || "Force transfer failed");
    } finally {
      setBusy(false);
    }
  };

  const cancelOffer = async () => {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const factory = await createFactoryActor(identity);
      const site = Principal.fromText(siteId.trim());
      const result = await factory.adminCancelSiteTransfer(site);
      if (result?.err) setErr(result.err);
      else {
        setMsg(result?.ok || "Offer cancelled");
        await loadLog();
      }
    } catch (e) {
      setErr(e?.message || "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  const genRecovery = async () => {
    if (!identityVerified) {
      setErr("Check “I verified this user’s identity” before generating a code.");
      return;
    }
    setBusy(true);
    setMsg("");
    setErr("");
    setLastIssuedCode("");
    try {
      const factory = await createFactoryActor(identity);
      const site = Principal.fromText(siteId.trim());
      const result = await factory.adminGenerateSiteRecoveryCode(site);
      if (result?.err) setErr(result.err);
      else {
        setLastIssuedCode(result.ok);
        setMsg("Recovery code issued — give it only to the verified user.");
      }
    } catch (e) {
      setErr(e?.message || "Generate recovery failed");
    } finally {
      setBusy(false);
    }
  };

  const approveRequest = async (req) => {
    if (!identityVerified) {
      setErr("Check “I verified this user’s identity” before approving.");
      return;
    }
    setBusy(true);
    setMsg("");
    setErr("");
    setLastIssuedCode("");
    try {
      const factory = await createFactoryActor(identity);
      const site = req.site?.toText ? req.site : Principal.fromText(String(req.site));
      const requester = req.requester?.toText
        ? req.requester
        : Principal.fromText(String(req.requester));
      const result = await factory.adminApproveRecoveryRequest(site, requester, true);
      if (result?.err) setErr(result.err);
      else {
        setLastIssuedCode(result.ok);
        setMsg(
          "Approved. Code queued for the requester (revealPendingRecoveryCode) and shown below once."
        );
        setIdentityVerified(false);
        await loadLog();
      }
    } catch (e) {
      setErr(e?.message || "Approve failed");
    } finally {
      setBusy(false);
    }
  };

  const rejectRequest = async (req) => {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const factory = await createFactoryActor(identity);
      const site = req.site?.toText ? req.site : Principal.fromText(String(req.site));
      const requester = req.requester?.toText
        ? req.requester
        : Principal.fromText(String(req.requester));
      const result = await factory.adminRejectRecoveryRequest(site, requester);
      if (result?.err) setErr(result.err);
      else {
        setMsg(result?.ok || "Rejected");
        await loadLog();
      }
    } catch (e) {
      setErr(e?.message || "Reject failed");
    } finally {
      setBusy(false);
    }
  };

  const saveFee = async () => {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const factory = await createFactoryActor(identity);
      const parts = String(feeIcp).trim().split(".");
      const whole = BigInt(parts[0] || "0");
      let frac = (parts[1] || "").replace(/\D/g, "").slice(0, 8);
      while (frac.length < 8) frac += "0";
      const e8s = whole * 100_000_000n + BigInt(frac || "0");
      const text = await factory.adminSetTransferFee(e8s);
      setMsg(typeof text === "string" ? text : "Fee saved");
    } catch (e) {
      setErr(e?.message || "Save fee failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ice-glass-soft" style={{ padding: "1rem", marginTop: "0.75rem" }}>
      <h3 style={{ margin: "0 0 0.35rem", color: "#f8fafc", fontSize: "1rem" }}>
        Site transfers (emergency)
      </h3>
      <p style={{ margin: "0 0 0.85rem", fontSize: "0.8rem", color: "#64748b", lineHeight: 1.45 }}>
        Assist ownership handoffs when a user cannot complete offer/claim. Factory must still be a
        controller of the site (broken sites like some orphan canisters need controller repair first).
      </p>

      <div
        className="ice-glass-soft"
        style={{ padding: "0.75rem 0.85rem", marginBottom: "1rem", border: "1px solid rgba(251,191,36,0.35)" }}
      >
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#fde68a", marginBottom: "0.35rem" }}>
          ONE-TIME PRINCIPAL MIGRATION
        </div>
        <p style={{ margin: "0 0 0.55rem", fontSize: "0.78rem", color: "#94a3b8", lineHeight: 1.4 }}>
          When open, non-master users sign in with II and type their site canister id to remaps it to
          this login. Each site once. Masters are excluded. Claimed: {migrationClaimed}.
        </p>
        <button
          type="button"
          className={migrationOpen ? "ice-btn ice-btn-danger" : "ice-btn-primary"}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg("");
            setErr("");
            try {
              const factory = await createFactoryActor(identity);
              const text = await factory.adminSetPrincipalMigration(!migrationOpen);
              setMsg(typeof text === "string" ? text : "Updated");
              await loadLog();
            } catch (e) {
              setErr(e?.message || "Toggle failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          {migrationOpen ? "Close principal migration" : "Open principal migration"}
        </button>
      </div>

      <div style={{ marginBottom: "0.85rem" }}>
        <label style={{ display: "block", fontSize: "0.75rem", color: "#64748b", marginBottom: 4 }}>
          Site canister ID
        </label>
        <input
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          placeholder="xxxxx-…-cai"
          style={{
            width: "100%",
            padding: "0.45rem 0.55rem",
            borderRadius: 8,
            border: "1px solid rgba(148,163,184,0.25)",
            background: "rgba(9,9,11,0.7)",
            color: "#e2e8f0",
          }}
        />
      </div>
      <div style={{ marginBottom: "0.85rem" }}>
        <label style={{ display: "block", fontSize: "0.75rem", color: "#64748b", marginBottom: 4 }}>
          New owner II principal (force transfer)
        </label>
        <input
          value={toPrincipal}
          onChange={(e) => setToPrincipal(e.target.value)}
          placeholder="aaaaa-…"
          style={{
            width: "100%",
            padding: "0.45rem 0.55rem",
            borderRadius: 8,
            border: "1px solid rgba(148,163,184,0.25)",
            background: "rgba(9,9,11,0.7)",
            color: "#e2e8f0",
          }}
        />
      </div>
      <label
        style={{
          display: "flex",
          gap: "0.45rem",
          alignItems: "flex-start",
          marginBottom: "0.85rem",
          fontSize: "0.82rem",
          color: "#fde68a",
          lineHeight: 1.4,
        }}
      >
        <input
          type="checkbox"
          checked={identityVerified}
          onChange={(e) => setIdentityVerified(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>
          I verified this user’s identity is true (off-platform: NNS match, prior contact, etc.) before
          issuing any recovery code.
        </span>
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "1rem" }}>
        <button
          type="button"
          className="ice-btn-primary"
          disabled={busy || !siteId.trim() || !toPrincipal.trim()}
          onClick={forceTransfer}
        >
          Force transfer
        </button>
        <button
          type="button"
          className="ice-btn ice-btn-danger"
          disabled={busy || !siteId.trim()}
          onClick={cancelOffer}
        >
          Cancel offer on site
        </button>
        <button
          type="button"
          className="ice-btn"
          disabled={busy || !siteId.trim() || !identityVerified}
          onClick={genRecovery}
        >
          Generate recovery code
        </button>
      </div>

      {lastIssuedCode && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem",
            borderRadius: 10,
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(134,239,172,0.35)",
            wordBreak: "break-all",
            fontFamily: "ui-monospace, monospace",
            color: "#e2e8f0",
            fontSize: "0.85rem",
          }}
        >
          <div style={{ fontSize: "0.7rem", color: "#86efac", fontWeight: 700, marginBottom: 6 }}>
            CODE (SHOW ONCE TO VERIFIED USER)
          </div>
          {lastIssuedCode}
        </div>
      )}

      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#86efac", marginBottom: "0.35rem" }}>
        PENDING RECOVERY REQUESTS
      </div>
      <p style={{ margin: "0 0 0.55rem", fontSize: "0.75rem", color: "#64748b" }}>
        Users must call request while signed in (proves II session). Approve only after you verify
        identity.
      </p>
      {recoveryReqs.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "0.8rem" }}>No pending requests.</p>
      ) : (
        <ul style={{ margin: "0 0 1rem", paddingLeft: "1.1rem", fontSize: "0.75rem", color: "#94a3b8" }}>
          {recoveryReqs.map((r, i) => {
            const siteT = r.site?.toText?.() || String(r.site);
            const reqT = r.requester?.toText?.() || String(r.requester);
            const ownT = r.registeredOwner?.[0]?.toText?.()
              || (Array.isArray(r.registeredOwner) && r.registeredOwner[0]
                ? String(r.registeredOwner[0])
                : r.registeredOwner?.toText?.() || "—");
            return (
              <li key={i} style={{ marginBottom: "0.65rem" }}>
                <div>
                  site <code style={{ color: "#e2e8f0" }}>{siteT}</code>
                </div>
                <div>
                  requester <code style={{ color: "#e2e8f0" }}>{reqT}</code>
                </div>
                <div>registered owner {ownT}</div>
                {r.note ? <div>note: {r.note}</div> : null}
                <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="ice-btn-primary"
                    disabled={busy || !identityVerified}
                    onClick={() => approveRequest(r)}
                  >
                    Approve + issue code
                  </button>
                  <button
                    type="button"
                    className="ice-btn ice-btn-danger"
                    disabled={busy}
                    onClick={() => rejectRequest(r)}
                  >
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", alignItems: "center", marginBottom: "1rem" }}>
        <input
          value={feeIcp}
          onChange={(e) => setFeeIcp(e.target.value)}
          style={{
            width: "6rem",
            padding: "0.4rem 0.5rem",
            borderRadius: 8,
            border: "1px solid rgba(148,163,184,0.25)",
            background: "rgba(9,9,11,0.7)",
            color: "#e2e8f0",
          }}
        />
        <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>ICP claim fee</span>
        <button type="button" className="ice-btn" disabled={busy} onClick={saveFee}>
          Save fee
        </button>
      </div>

      {msg && <p style={{ color: "#86efac", fontSize: "0.82rem" }}>{msg}</p>}
      {err && <p style={{ color: "#f87171", fontSize: "0.82rem" }}>{err}</p>}

      <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#7dd3fc", margin: "0.75rem 0 0.35rem" }}>
        RECENT TRANSFER LOG
      </div>
      {log.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "0.8rem" }}>No transfers yet.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: "1.1rem", fontSize: "0.75rem", color: "#94a3b8" }}>
          {log
            .slice()
            .reverse()
            .map((row, i) => (
              <li key={i} style={{ marginBottom: "0.35rem" }}>
                <strong style={{ color: "#e2e8f0" }}>{row.kind}</strong> · site{" "}
                {row.site?.toText?.() || String(row.site)} · from{" "}
                {(row.fromOwner?.toText?.() || "").slice(0, 12)}… →{" "}
                {(row.toOwner?.toText?.() || "").slice(0, 12)}…
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
