import React, { useCallback, useEffect, useState } from "react";
import { createFactoryActor } from "./actors";
import NnsIcpFee from "./NnsIcpFee";
import { FACTORY_CANISTER_ID } from "./actors";

function e8sLabel(e8s) {
  const n = typeof e8s === "bigint" ? Number(e8s) : Number(e8s ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "0";
  const icp = n / 100_000_000;
  return Number.isInteger(icp) ? String(icp) : icp.toFixed(4).replace(/\.?0+$/, "");
}

/**
 * My Site → Transfer: create/cancel offer (owner) or claim a code (recipient).
 * Transfers the personal website canister — not ICE posts/username.
 */
export default function SiteTransfer({ identity, siteId, linked, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [status, setStatus] = useState(null);
  const [oneTimeCode, setOneTimeCode] = useState("");
  const [claimCode, setClaimCode] = useState("");
  const [feeReady, setFeeReady] = useState(false);
  const [feeE8s, setFeeE8s] = useState(0n);
  const [requestSite, setRequestSite] = useState("");
  const [requestNote, setRequestNote] = useState("");

  const load = useCallback(async () => {
    if (!identity) return;
    try {
      const factory = await createFactoryActor(identity);
      let st = null;
      if (factory.getMyTransferOfferStatus) {
        st = await factory.getMyTransferOfferStatus();
      }
      setStatus(st);
      const fee = st?.transferFeeE8s != null ? BigInt(st.transferFeeE8s) : 0n;
      setFeeE8s(fee);
      if (factory.getFees && fee === 0n) {
        try {
          const fees = await factory.getFees();
          if (fees?.transferFeeE8s != null) setFeeE8s(BigInt(fees.transferFeeE8s));
        } catch (_) {
          /* optional */
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [identity]);

  useEffect(() => {
    load();
  }, [load]);

  const createOffer = async () => {
    setBusy(true);
    setMsg("");
    setErr("");
    setOneTimeCode("");
    try {
      const factory = await createFactoryActor(identity);
      let result;
      if (siteId && factory.createSiteTransferOfferFor) {
        const { Principal } = await import("@dfinity/principal");
        result = await factory.createSiteTransferOfferFor(Principal.fromText(String(siteId)));
      } else {
        result = await factory.createSiteTransferOffer();
      }
      if (result?.err) {
        setErr(result.err);
      } else if (result?.ok) {
        setOneTimeCode(result.ok);
        setMsg("Offer created. Copy the code now — it is shown only once.");
        await load();
        if (onChanged) onChanged();
      } else {
        setErr("Unexpected response");
      }
    } catch (e) {
      setErr(e?.message || "Create offer failed");
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
      const result = await factory.cancelSiteTransferOffer();
      if (result?.err) setErr(result.err);
      else {
        setMsg(result?.ok || "Cancelled");
        setOneTimeCode("");
        await load();
      }
    } catch (e) {
      setErr(e?.message || "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    if (!claimCode.trim()) {
      setErr("Enter a transfer code");
      return;
    }
    if (feeE8s > 0n && !feeReady) {
      setErr("Approve the transfer fee with Internet Identity first.");
      return;
    }
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const factory = await createFactoryActor(identity);
      const result = await factory.claimSiteTransfer(claimCode.trim());
      if (result?.err) setErr(result.err);
      else {
        setMsg(result?.ok || "Site claimed.");
        setClaimCode("");
        setFeeReady(false);
        await load();
        if (onChanged) onChanged();
      }
    } catch (e) {
      setErr(e?.message || "Claim failed");
    } finally {
      setBusy(false);
    }
  };

  const copyCode = async () => {
    if (!oneTimeCode) return;
    try {
      await navigator.clipboard?.writeText(oneTimeCode);
      setMsg("Code copied.");
    } catch (_) {
      setMsg("Select and copy the code manually.");
    }
  };

  const hasOpen = !!(status?.hasOffer);
  const expiresLabel = status?.expiresAt
    ? new Date(Number(status.expiresAt) / 1e6).toLocaleString()
    : "";

  return (
    <div className="ice-glass-soft" style={{ padding: "1rem" }}>
      <h3 style={{ margin: "0 0 0.35rem", color: "#f8fafc", fontSize: "1rem" }}>
        Transfer website
      </h3>
      <p style={{ margin: "0 0 0.85rem", fontSize: "0.8rem", color: "#94a3b8", lineHeight: 1.45 }}>
        Hand off this <strong style={{ color: "#e2e8f0" }}>personal website canister</strong> to
        another Internet Identity. This does <em>not</em> move your ICE posts or username — only the
        site. Full handoff: you lose the site link; they become the user-controller.
      </p>

      {linked && siteId ? (
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#7dd3fc", marginBottom: "0.45rem" }}>
            CREATE OFFER (YOU OWN THIS SITE)
          </div>
          {hasOpen ? (
            <p style={{ fontSize: "0.85rem", color: "#fde68a", marginTop: 0 }}>
              Open offer expires {expiresLabel || "soon"}. Share the code only with the recipient.
            </p>
          ) : (
            <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 0 }}>
              Creates a one-time code (valid ~48 hours).
            </p>
          )}
          {oneTimeCode && (
            <div
              style={{
                padding: "0.75rem",
                marginBottom: "0.65rem",
                borderRadius: 10,
                background: "rgba(0,0,0,0.35)",
                border: "1px solid rgba(125,211,252,0.35)",
                wordBreak: "break-all",
                fontFamily: "ui-monospace, monospace",
                color: "#e2e8f0",
              }}
            >
              {oneTimeCode}
              <div style={{ marginTop: "0.5rem" }}>
                <button type="button" className="ice-btn" onClick={copyCode}>
                  Copy code
                </button>
              </div>
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
            <button
              type="button"
              className="ice-btn-primary"
              disabled={busy}
              onClick={createOffer}
            >
              {busy ? "Working…" : hasOpen ? "Create new offer (replaces)" : "Create transfer offer"}
            </button>
            {hasOpen && (
              <button type="button" className="ice-btn ice-btn-danger" disabled={busy} onClick={cancelOffer}>
                Cancel offer
              </button>
            )}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: "0.85rem", color: "#64748b" }}>
          Link a site to create an outgoing transfer offer. You can still claim a code below if
          someone is sending you a site.
        </p>
      )}

      <div style={{ borderTop: "1px solid rgba(148,163,184,0.15)", paddingTop: "1rem", marginBottom: "1rem" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#fde68a", marginBottom: "0.45rem" }}>
          ASK MASTER FOR A RECOVERY CODE
        </div>
        <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 0, lineHeight: 1.45 }}>
          Sign in with your current II (that proves this session), enter the site canister id, and
          file a request. Master verifies your identity off-app, then approves — you can reveal the
          code afterward.
        </p>
        <input
          value={requestSite}
          onChange={(e) => setRequestSite(e.target.value)}
          placeholder="site canister id (…-cai)"
          style={{
            width: "100%",
            marginBottom: "0.45rem",
            padding: "0.5rem 0.65rem",
            borderRadius: 8,
            border: "1px solid rgba(148,163,184,0.25)",
            background: "rgba(9,9,11,0.7)",
            color: "#e2e8f0",
          }}
        />
        <input
          value={requestNote}
          onChange={(e) => setRequestNote(e.target.value)}
          placeholder="Optional note (how master can verify you)"
          style={{
            width: "100%",
            marginBottom: "0.45rem",
            padding: "0.5rem 0.65rem",
            borderRadius: 8,
            border: "1px solid rgba(148,163,184,0.25)",
            background: "rgba(9,9,11,0.7)",
            color: "#e2e8f0",
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.85rem" }}>
          <button
            type="button"
            className="ice-btn"
            disabled={busy || !requestSite.trim()}
            onClick={async () => {
              setBusy(true);
              setMsg("");
              setErr("");
              try {
                const factory = await createFactoryActor(identity);
                const { Principal } = await import("@dfinity/principal");
                const result = await factory.requestSiteRecovery(
                  Principal.fromText(requestSite.trim()),
                  requestNote.trim()
                );
                if (result?.err) setErr(result.err);
                else setMsg(result?.ok || "Request filed — wait for master approval.");
              } catch (e) {
                setErr(e?.message || "Request failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Request recovery help
          </button>
          <button
            type="button"
            className="ice-btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMsg("");
              setErr("");
              try {
                const factory = await createFactoryActor(identity);
                const rev = await factory.revealPendingRecoveryCode();
                if (rev?.err) setErr(rev.err);
                else {
                  setOneTimeCode(rev.ok);
                  setMsg("Recovery code revealed — save offline.");
                }
              } catch (e) {
                setErr(e?.message || "Reveal failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Reveal code after master approval
          </button>
        </div>

        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#86efac", marginBottom: "0.45rem" }}>
          RECOVERY CODE (LOGIN MISMATCH)
        </div>
        <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 0, lineHeight: 1.45 }}>
          If you already have an <code>ICE-RCV-</code> code, paste it here while signed in. The
          website remaps to <strong style={{ color: "#e2e8f0" }}>this</strong> II.
        </p>
        <input
          value={claimCode}
          onChange={(e) => {
            setClaimCode(e.target.value);
            setFeeReady(false);
          }}
          placeholder="ICE-RCV-… or ICE-XFER-…"
          style={{
            width: "100%",
            marginBottom: "0.55rem",
            padding: "0.5rem 0.65rem",
            borderRadius: 8,
            border: "1px solid rgba(148,163,184,0.25)",
            background: "rgba(9,9,11,0.7)",
            color: "#e2e8f0",
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.75rem" }}>
          <button
            type="button"
            className="ice-btn-primary"
            disabled={busy || !claimCode.trim() || !claimCode.trim().startsWith("ICE-RCV")}
            onClick={async () => {
              setBusy(true);
              setMsg("");
              setErr("");
              try {
                const factory = await createFactoryActor(identity);
                const result = await factory.claimSiteWithRecoveryCode(claimCode.trim());
                if (result?.err) setErr(result.err);
                else {
                  setMsg(result?.ok || "Site recovered.");
                  setClaimCode("");
                  const reveal = await factory.revealPendingRecoveryCode?.();
                  if (reveal?.ok) {
                    setOneTimeCode(reveal.ok);
                    setMsg((m) => `${m} New recovery code shown below — save it.`);
                  }
                  await load();
                  if (onChanged) onChanged();
                }
              } catch (e) {
                setErr(e?.message || "Recovery failed");
              } finally {
                setBusy(false);
              }
            }}
          >
            Recover with ICE-RCV code
          </button>
          {linked && siteId && (
            <button
              type="button"
              className="ice-btn"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setMsg("");
                setErr("");
                setOneTimeCode("");
                try {
                  const factory = await createFactoryActor(identity);
                  let result;
                  if (siteId && factory.regenerateSiteRecoveryCodeFor) {
                    const { Principal } = await import("@dfinity/principal");
                    result = await factory.regenerateSiteRecoveryCodeFor(
                      Principal.fromText(String(siteId))
                    );
                  } else {
                    result = await factory.regenerateSiteRecoveryCode();
                  }
                  if (result?.err) setErr(result.err);
                  else {
                    setOneTimeCode(result.ok);
                    setMsg("New recovery code created — copy and store offline. Old code is dead.");
                  }
                } catch (e) {
                  setErr(e?.message || "Regenerate failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Regenerate recovery code
            </button>
          )}
        </div>
      </div>

      <div style={{ borderTop: "1px solid rgba(148,163,184,0.15)", paddingTop: "1rem" }}>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#c4b5fd", marginBottom: "0.45rem" }}>
          CLAIM A TRANSFERRED SITE
        </div>
        <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 0, lineHeight: 1.45 }}>
          Paste the code from the current owner. You must not already have a different linked site.
          {feeE8s > 0n
            ? ` Claim fee: ${e8sLabel(feeE8s)} ICP (approve below).`
            : " No claim fee."}
        </p>
        <p style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 0 }}>
          Use an <code>ICE-XFER-</code> code from a transfer offer (not recovery).
        </p>
        {feeE8s > 0n && claimCode.trim().startsWith("ICE-XFER") && (
          <div style={{ marginBottom: "0.55rem" }}>
            <NnsIcpFee
              key={feeE8s.toString() + claimCode}
              identity={identity}
              feeE8s={feeE8s}
              spenderCanisterId={FACTORY_CANISTER_ID}
              purpose="site transfer claim"
              onReadyChange={(r) => setFeeReady(!!r)}
            />
          </div>
        )}
        <button
          type="button"
          className="ice-btn-primary"
          disabled={
            busy ||
            !claimCode.trim().startsWith("ICE-XFER") ||
            (feeE8s > 0n && !feeReady)
          }
          onClick={claim}
        >
          {busy ? "Claiming…" : "Claim transfer (ICE-XFER)"}
        </button>
      </div>

      {msg && <p style={{ color: "#86efac", fontSize: "0.82rem", marginTop: "0.75rem" }}>{msg}</p>}
      {err && <p style={{ color: "#f87171", fontSize: "0.82rem", marginTop: "0.75rem" }}>{err}</p>}
    </div>
  );
}
