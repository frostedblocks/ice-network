import React, { useState, useEffect, useCallback } from "react";
import { Principal } from "@dfinity/principal";
import { getIceCanisterId } from "./icpLedger";
import {
  ASSETS_CANISTER_ID,
  FACTORY_CANISTER_ID,
  createFactoryActor,
  createAnonymousFactoryActor,
  createAnonymousIceActor,
} from "./actors";
import { unwrapOpt } from "./candidUtils";
import NnsIcpFee from "./NnsIcpFee";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Create username is free and calls ICE register only.
 * Mint site is a separate button: approve 10 ICP (2.7 cycles / 7.3 network), then ensureUserSite.
 */
export default function Register({ actor, identity, onRegistered, onCancel }) {
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState("");
  const [siteId, setSiteId] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [feeEnabled, setFeeEnabled] = useState(true);
  const [feeE8s, setFeeE8s] = useState(1_000_000_000); // 10 ICP mint default
  const [mintCyclesShareE8s, setMintCyclesShareE8s] = useState(270_000_000);
  const [mintNetworkOpsE8s, setMintNetworkOpsE8s] = useState(730_000_000);
  const [isMaster, setIsMaster] = useState(false);
  const [cfgLoading, setCfgLoading] = useState(true);
  const [nnsFeeReady, setNnsFeeReady] = useState(false);
  const [capacity, setCapacity] = useState(null);
  /** True after ICE register succeeded — show optional Mint step */
  const [registeredNoSite, setRegisteredNoSite] = useState(false);
  /** Mint-step ack: blocks a second paid mint if they already have an ICE site */
  const [ackNoPriorAccount, setAckNoPriorAccount] = useState(false);

  const loadCapacity = useCallback(async () => {
    try {
      const factory = await createFactoryActor(identity);
      if (factory.getProvisionCapacity) {
        const cap = await factory.getProvisionCapacity();
        setCapacity(cap);
        return cap;
      }
      if (factory.getFactoryCycles) {
        const c = await factory.getFactoryCycles();
        const cycles = typeof c === "bigint" ? Number(c) : Number(c);
        const min = 1_100_000_000_000;
        const can = cycles >= min;
        const cap = {
          factoryCycles: c,
          minRequired: min,
          wasmReady: true,
          canMint: can,
          message: can
            ? "Factory can mint personal websites."
            : "Factory cycles may be too low to create websites.",
        };
        setCapacity(cap);
        return cap;
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  }, [identity]);

  useEffect(() => {
    if (!actor || !identity) return;
    (async () => {
      setCfgLoading(true);
      try {
        const principal = identity.getPrincipal();
        let master = false;
        try {
          master = actor.isOwner ? !!(await actor.isOwner(principal)) : false;
        } catch (_) {
          master = false;
        }
        setIsMaster(master);

        // Fee-at-mint: one 10 ICP charge on Factory, not ICE registration
        try {
          const factory = await createFactoryActor(identity);
          if (factory.getFees) {
            const fees = await factory.getFees();
            const mint = Number(fees.mintFeeE8s ?? 1_000_000_000) || 1_000_000_000;
            const cycles = Number(fees.mintCyclesShareE8s ?? 270_000_000) || 270_000_000;
            const ops =
              Number(fees.mintNetworkOpsE8s ?? Math.max(0, mint - cycles)) ||
              Math.max(0, mint - cycles);
            setFeeE8s(mint);
            setMintCyclesShareE8s(cycles);
            setMintNetworkOpsE8s(ops);
            setFeeEnabled(mint > 0);
          } else {
            setFeeE8s(1_000_000_000);
            setFeeEnabled(true);
          }
        } catch (_) {
          setFeeE8s(1_000_000_000);
          setFeeEnabled(true);
        }

        await loadCapacity();
      } catch (e) {
        console.error(e);
      } finally {
        setCfgLoading(false);
      }
    })();
  }, [actor, identity, loadCapacity]);

  const mustPay = !isMaster && feeEnabled && feeE8s > 0;
  const feeIcp = (feeE8s / 100_000_000).toFixed(feeE8s % 100_000_000 === 0 ? 0 : 4);
  const cyclesIcp = (mintCyclesShareE8s / 100_000_000).toFixed(
    mintCyclesShareE8s % 100_000_000 === 0 ? 0 : 4
  );
  const opsIcp = (mintNetworkOpsE8s / 100_000_000).toFixed(
    mintNetworkOpsE8s % 100_000_000 === 0 ? 0 : 4
  );
  const canMint = capacity == null ? true : !!capacity.canMint;
  /** Join is username-only — no prior-account gate on free register */
  const canSubmitFree = true;
  /** Site mint — ack + capacity + II approve when fee is on */
  const canSubmitMint =
    canMint &&
    (isMaster || ackNoPriorAccount) &&
    (isMaster || !mustPay || nnsFeeReady);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!actor || !identity) return;

    const name = username.trim();
    if (name.length === 0) {
      setError("Choose a username.");
      return;
    }
    if (name.length > 50) {
      setError("Username must be 50 characters or less.");
      return;
    }

    if (!getIceCanisterId()) {
      setError("App misconfigured: missing canister id.");
      return;
    }

    setLoading(true);
    setError("");
    setSiteId("");

    try {
      setStep(isMaster ? "Creating master account…" : "Creating free username…");
      const result = await actor.register(name, bio.trim(), "");
      const text = typeof result === "string" ? result : "";
      const regOk =
        /^Registered/i.test(text) ||
        /success/i.test(text) ||
        /Already registered/i.test(text);
      if (!regOk) {
        setError(text || "Registration failed.");
        setStep("");
        setLoading(false);
        return;
      }
      setRegisteredNoSite(true);
      setStep("Username ready. Mint a site if you want, or continue to the feed.");
    } catch (err) {
      console.error(err);
      setError(err?.message || "Registration failed.");
      setStep("");
    } finally {
      setLoading(false);
    }
  };

  const retrySiteOnly = async () => {
    if (!identity) return;
    if (!isMaster && mustPay && !nnsFeeReady) {
      setError(
        "Approve the " +
          feeIcp +
          " ICP mint fee (Factory) before minting. Principal: " +
          (identity.getPrincipal?.().toText?.() || "")
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      const cap = await loadCapacity();
      if (cap && !cap.canMint) {
        setError(
          (cap.message || "Factory cannot mint right now.") +
            "\n\nDo not approve mint ICP until minting is ready."
        );
        setLoading(false);
        return;
      }
      const site = await provisionWebsite(3);
      if (!site.ok) {
        setRegisteredNoSite(true);
        setError(
          site.error +
            "\n\nIf Factory already charged and the canister was created, ICP is held for resume — use Mint site again (no second charge while pending). If charge failed before create, you were refunded."
        );
        setStep("");
      } else {
        setRegisteredNoSite(false);
        setStep("Website ready!");
        if (onRegistered) {
          onRegistered({ registered: true, siteId: site.siteId });
        }
      }
    } catch (e) {
      setError(e?.message || "Mint failed");
    } finally {
      setLoading(false);
    }
  };

  if (cfgLoading) {
    return (
      <p style={{ textAlign: "center", color: "#64748b", marginTop: "3rem" }}>
        Loading registration…
      </p>
    );
  }

  return (
    <div
      className="ice-glass"
      style={{
        maxWidth: "440px",
        margin: "2rem auto",
        padding: "1.5rem",
      }}
    >
      <h2 className="ice-title" style={{ marginTop: 0 }}>
        {registeredNoSite ? "Optional personal site" : "Choose a username"}
      </h2>

      {!registeredNoSite ? (
        <>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5, margin: "0 0 0.85rem" }}>
            Pick a free username to post on ICE. A personal site is optional — you can mint one next,
            or continue without minting.
          </p>

          {isMaster && (
            <p
              style={{
                margin: "0 0 1rem",
                padding: "0.55rem 0.7rem",
                borderRadius: 8,
                background: "rgba(30, 58, 95, 0.45)",
                border: "1px solid rgba(125, 211, 252, 0.35)",
                color: "#7dd3fc",
                fontSize: "0.85rem",
                fontWeight: 600,
              }}
            >
              Master account detected — registration is free (no ICP).
            </p>
          )}

          <form onSubmit={handleRegister}>
            <label style={labelStyle}>Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Unique username"
              maxLength={50}
              style={inputStyle}
              disabled={loading}
              autoFocus
              required
            />

            {onCancel && (
              <button
                type="button"
                className="ice-btn"
                disabled={loading}
                onClick={onCancel}
                style={{ width: "100%", marginTop: "0.75rem" }}
              >
                Back — keep browsing
              </button>
            )}

            <button
              type="submit"
              className="ice-btn-primary"
              disabled={loading || !username.trim() || !canSubmitFree}
              style={{ width: "100%", marginTop: "0.65rem" }}
            >
              {loading
                ? step || "Working…"
                : isMaster
                ? "Create master username (free)"
                : "Create username (free)"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5, margin: "0 0 0.85rem" }}>
            Username ready. Mint a personal site only if you want one. Continuing without minting is
            the usual next step.
          </p>

          {mustPay && (
            <p
              style={{
                margin: "0 0 0.85rem",
                padding: "0.55rem 0.7rem",
                borderRadius: 8,
                background: "rgba(22, 101, 52, 0.25)",
                border: "1px solid rgba(74, 222, 128, 0.3)",
                color: "#86efac",
                fontSize: "0.8rem",
                fontWeight: 600,
                lineHeight: 1.45,
              }}
            >
              Optional site mint:{" "}
              <strong style={{ color: "#fbbf24" }}>{feeIcp} ICP</strong> once ({cyclesIcp} ICP →
              canister cycles, {opsIcp} ICP → network ops). A hosting fee — not a token sale.
            </p>
          )}

          {capacity && (
            <div
              style={{
                margin: "0 0 0.85rem",
                padding: "0.55rem 0.7rem",
                borderRadius: 8,
                background: canMint ? "rgba(22, 101, 52, 0.2)" : "rgba(127, 29, 29, 0.35)",
                border: canMint
                  ? "1px solid rgba(74, 222, 128, 0.28)"
                  : "1px solid rgba(248, 113, 113, 0.4)",
                color: canMint ? "#86efac" : "#fecaca",
                fontSize: "0.78rem",
                lineHeight: 1.45,
              }}
            >
              <strong>Factory mint status:</strong> {canMint ? "Ready" : "Blocked"}
              <div style={{ marginTop: "0.25rem", opacity: 0.95 }}>{capacity.message}</div>
              {!canMint && mustPay && (
                <div style={{ marginTop: "0.35rem", fontWeight: 700 }}>
                  Do not approve mint ICP until minting is ready.
                </div>
              )}
            </div>
          )}

          <div
            style={{
              margin: "0 0 0.85rem",
              padding: "0.55rem 0.7rem",
              borderRadius: 8,
              background: "rgba(120, 53, 15, 0.3)",
              border: "1px solid rgba(251, 191, 36, 0.35)",
              color: "#fde68a",
              fontSize: "0.78rem",
              lineHeight: 1.45,
            }}
          >
            <strong>Already paid mint?</strong> Do <em>not</em> approve ICP again. Use Mint site to
            resume (no second charge while a mint is pending).
            {identity?.getPrincipal && (
              <code
                style={{
                  display: "block",
                  marginTop: "0.4rem",
                  wordBreak: "break-all",
                  color: "#e2e8f0",
                  fontSize: "0.7rem",
                }}
              >
                {identity.getPrincipal().toText()}
              </code>
            )}
          </div>

          {!isMaster && (
            <label
              style={{
                display: "flex",
                gap: "0.55rem",
                alignItems: "flex-start",
                margin: "0 0 0.85rem",
                padding: "0.65rem 0.75rem",
                borderRadius: 10,
                border: ackNoPriorAccount
                  ? "1px solid rgba(74, 222, 128, 0.35)"
                  : "1px solid rgba(251, 191, 36, 0.45)",
                background: ackNoPriorAccount
                  ? "rgba(22, 101, 52, 0.2)"
                  : "rgba(120, 53, 15, 0.22)",
                color: "#e2e8f0",
                fontSize: "0.8rem",
                lineHeight: 1.45,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={ackNoPriorAccount}
                onChange={(e) => setAckNoPriorAccount(e.target.checked)}
                style={{ marginTop: "0.2rem" }}
              />
              <span>
                I confirm I do <strong>not</strong> already have an ICE personal website on another
                principal. Minting again can create a second site and charge the {feeIcp} ICP fee
                again.
              </span>
            </label>
          )}

          {mustPay && !isMaster && (
            <NnsIcpFee
              identity={identity}
              feeE8s={BigInt(feeE8s)}
              spenderCanisterId={FACTORY_CANISTER_ID}
              purpose={`site mint (${cyclesIcp} ICP canister cycles + ${opsIcp} ICP network)`}
              onReadyChange={onFeeReady}
            />
          )}

          {onRegistered && (
            <button
              type="button"
              className="ice-btn-primary"
              disabled={loading}
              onClick={() => onRegistered({ registered: true, siteId: siteId || null })}
              style={{ width: "100%", marginTop: "0.75rem" }}
            >
              Continue without minting
            </button>
          )}

          <button
            type="button"
            className="ice-btn"
            disabled={loading || !canSubmitMint}
            onClick={retrySiteOnly}
            style={{
              width: "100%",
              marginTop: "0.55rem",
              opacity: !canSubmitMint ? 0.55 : 1,
            }}
          >
            {loading
              ? step || "Minting site…"
              : !canMint
              ? "Mint blocked — factory not ready"
              : !isMaster && !ackNoPriorAccount
              ? "Confirm you’re new to minting (checkbox)"
              : mustPay && !nnsFeeReady
              ? `Approve ${feeIcp} ICP, then mint site`
              : mustPay
              ? `Mint site (${feeIcp} ICP · ${cyclesIcp} / ${opsIcp})`
              : "Mint site (free for you)"}
          </button>

          {siteId && (
            <div
              className="ice-glass-soft"
              style={{
                marginTop: "1rem",
                padding: "0.85rem",
                border: "1px solid rgba(56, 189, 248, 0.35)",
              }}
            >
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "#7dd3fc",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                }}
              >
                YOUR WEBSITE CANISTER ID
              </div>
              <p
                style={{
                  margin: "0.4rem 0 0",
                  fontFamily: "ui-monospace, Menlo, monospace",
                  fontSize: "0.85rem",
                  color: "#f8fafc",
                  wordBreak: "break-all",
                  fontWeight: 600,
                }}
              >
                {siteId}
              </p>
              {recoveryCode ? (
                <>
                  <div
                    style={{
                      fontSize: "0.7rem",
                      color: "#86efac",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      marginTop: "0.85rem",
                    }}
                  >
                    RECOVERY CODE — SAVE OFFLINE (SHOWN ONCE)
                  </div>
                  <p
                    style={{
                      margin: "0.4rem 0 0",
                      fontFamily: "ui-monospace, Menlo, monospace",
                      fontSize: "0.85rem",
                      color: "#f8fafc",
                      wordBreak: "break-all",
                      fontWeight: 600,
                    }}
                  >
                    {recoveryCode}
                  </p>
                </>
              ) : null}
            </div>
          )}
        </>
      )}

      {error && (
        <p style={{ color: "#f87171", fontSize: "0.85rem", marginTop: "0.75rem", whiteSpace: "pre-wrap" }}>
          {error}
        </p>
      )}
    </div>
  );
}

const labelStyle = {
  display: "block",
  color: "#94a3b8",
  fontSize: "0.85rem",
  marginBottom: "0.35rem",
  marginTop: "0.75rem",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.55rem 0.7rem",
  background: "rgba(9, 9, 11, 0.72)",
  color: "#e2e8f0",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: "8px",
  fontSize: "0.95rem",
};
