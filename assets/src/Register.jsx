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
import InviteCard, { captureInviteRefFromUrl, readInviteRef, clearInviteRef } from "./InviteCard";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CANONICAL_APP_URL = "https://frostedblocks.com/";

/**
 * First-time Join ICE (fee-at-mint):
 * 1) Gate on factory mint capacity (no pay if factory cannot mint)
 * 2) Free username register on ICE
 * 3) Approve 10 ICP mint fee to Factory (canister + network) if required
 * 4) ensureUserSite — Factory charges once; retries/resume do not re-charge
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
  const [bonusTokens, setBonusTokens] = useState(0);
  const [anyActionFeeOn, setAnyActionFeeOn] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [cfgLoading, setCfgLoading] = useState(true);
  const [nnsFeeReady, setNnsFeeReady] = useState(false);
  const [capacity, setCapacity] = useState(null);
  /** True after ICE register succeeded but site mint still failing — allow site-only retry */
  const [registeredNoSite, setRegisteredNoSite] = useState(false);
  /** "new" = create account | "returning" = already have ICE — do not pay/mint */
  const [joinPath, setJoinPath] = useState("new");
  const [ackNoPriorAccount, setAckNoPriorAccount] = useState(false);
  const [priorPrincipal, setPriorPrincipal] = useState("");
  const [priorLookup, setPriorLookup] = useState(null); // null | { ok, registered, siteId, error }
  const [priorLooking, setPriorLooking] = useState(false);
  const [referralEligible, setReferralEligible] = useState(false);
  const [referralClaimed, setReferralClaimed] = useState(false);
  const [inviteRef] = useState(() => {
    captureInviteRefFromUrl();
    return readInviteRef();
  });

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

        if (actor.getMyReferralStatus) {
          try {
            const st = await actor.getMyReferralStatus();
            setReferralEligible(!!st.eligible);
            setReferralClaimed(!!st.claimed);
          } catch (_) {
            setReferralEligible(false);
            setReferralClaimed(false);
          }
        }

        if (actor.getEconomyConfig) {
          try {
            const cfg = await actor.getEconomyConfig();
            setBonusTokens(Number(cfg.registrationBonusTokens) || 0);
            const postOn = !!cfg.postFeeEnabled && Number(cfg.postFeeE8s ?? 0) > 0;
            const loveOn = !!cfg.loveFeeEnabled && Number(cfg.loveFeeE8s ?? 0) > 0;
            const msgOn = !!cfg.messageFeeEnabled && Number(cfg.messageFeeE8s ?? 0) > 0;
            setAnyActionFeeOn(postOn || loveOn || msgOn);
          } catch (_) {
            setAnyActionFeeOn(false);
          }
        } else {
          setAnyActionFeeOn(false);
        }

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

  const rewardFree = referralEligible && !referralClaimed;
  const mustPay = !isMaster && feeEnabled && feeE8s > 0 && !rewardFree;
  const feeIcp = (feeE8s / 100_000_000).toFixed(feeE8s % 100_000_000 === 0 ? 0 : 4);
  const cyclesIcp = (mintCyclesShareE8s / 100_000_000).toFixed(
    mintCyclesShareE8s % 100_000_000 === 0 ? 0 : 4
  );
  const opsIcp = (mintNetworkOpsE8s / 100_000_000).toFixed(
    mintNetworkOpsE8s % 100_000_000 === 0 ? 0 : 4
  );
  const canMint = capacity == null ? true : !!capacity.canMint;
  /** New users must confirm they don't already have an ICE account before pay/mint */
  const mayCreateNew =
    isMaster || ackNoPriorAccount || registeredNoSite;
  const canSubmit =
    mayCreateNew &&
    (isMaster || !mustPay || nnsFeeReady) &&
    (canMint || registeredNoSite);

  const lookupPriorAccount = async () => {
    const raw = priorPrincipal.trim();
    setPriorLookup(null);
    if (!raw) {
      setPriorLookup({ ok: false, error: "Paste your original principal first." });
      return;
    }
    let p;
    try {
      p = Principal.fromText(raw);
    } catch {
      setPriorLookup({ ok: false, error: "That doesn’t look like a valid principal." });
      return;
    }
    setPriorLooking(true);
    try {
      const [ice, factory] = await Promise.all([
        createAnonymousIceActor(),
        createAnonymousFactoryActor(),
      ]);
      let registered = false;
      if (ice.isRegistered) {
        registered = !!(await ice.isRegistered(p));
      }
      let siteId = "";
      if (factory.getUserCanister) {
        const opt = await factory.getUserCanister(p);
        const id = unwrapOpt(opt);
        if (id) siteId = id.toText ? id.toText() : String(id);
      }
      if (!registered && !siteId) {
        setPriorLookup({
          ok: false,
          registered: false,
          siteId: "",
          error:
            "No ICE registration or personal site found for that principal. Check the text, or you may be new.",
        });
      } else {
        setPriorLookup({
          ok: true,
          registered,
          siteId,
          error: "",
        });
      }
    } catch (e) {
      console.error(e);
      setPriorLookup({
        ok: false,
        error: e?.message || "Could not look up that principal.",
      });
    } finally {
      setPriorLooking(false);
    }
  };

  const onFeeReady = useCallback((ready) => setNnsFeeReady(!!ready), []);

  const formatCycles = (n) => {
    try {
      const v = typeof n === "bigint" ? n : BigInt(n ?? 0);
      const T = 1_000_000_000_000n;
      if (v >= T) {
        const whole = v / T;
        const frac = ((v % T) * 100n) / T;
        return `${whole}.${frac.toString().padStart(2, "0")} T`;
      }
      return v.toString();
    } catch {
      return String(n);
    }
  };

  const provisionWebsite = async (maxAttempts = 3) => {
    const factory = await createFactoryActor(identity);
    let lastErr = "Website creation failed.";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      setStep(
        maxAttempts > 1
          ? `Creating your personal website (attempt ${attempt}/${maxAttempts})…`
          : "Creating your personal website canister…"
      );
      try {
        const fn = factory.ensureUserSite || factory.createUserSite;
        const result = await fn.call(factory);
        if (result && "ok" in result && result.ok) {
          const id = result.ok.toText ? result.ok.toText() : String(result.ok);
          setSiteId(id);
          try {
            if (factory.revealPendingRecoveryCode) {
              const rev = await factory.revealPendingRecoveryCode();
              if (rev?.ok) setRecoveryCode(rev.ok);
            }
          } catch (_) {
            /* optional */
          }
          return { ok: true, siteId: id };
        }
        lastErr =
          (result && "err" in result && result.err) ||
          "Website creation failed. You are registered — retry site only (no Join fee).";
        // Low cycles: no point retrying immediately
        if (/cycles too low|No user_site WASM/i.test(lastErr)) {
          break;
        }
      } catch (e) {
        lastErr = e?.message || String(e);
      }
      if (attempt < maxAttempts) {
        await sleep(1200 * attempt);
      }
    }
    return { ok: false, error: lastErr };
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!actor || !identity) return;

    if (joinPath === "returning") {
      setError(
        "You chose “I already have an account.” Do not Create account here — open the canonical app with the same Internet Identity instead."
      );
      return;
    }

    if (!isMaster && !ackNoPriorAccount) {
      setError(
        "Confirm you do not already have an ICE account (checkbox below), or choose “I already have an account” so we don’t mint a second site."
      );
      return;
    }

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
      // Fresh capacity check before charging Join fee
      const cap = await loadCapacity();
      if (cap && !cap.canMint && !registeredNoSite) {
        setError(
          (cap.message || "Factory cannot create websites right now.") +
            "\n\nDo not pay Join until the network can mint sites. Master/ops must top up factory cycles or upload WASM."
        );
        setLoading(false);
        setStep("");
        return;
      }

      if (!registeredNoSite) {
        if (!isMaster && mustPay && !nnsFeeReady) {
          setError(
            "Approve the site mint fee (Factory) before creating your canister. Principal: " +
              (identity.getPrincipal?.().toText?.() || "")
          );
          setLoading(false);
          return;
        }

        setStep(
          isMaster
            ? "Creating master account…"
            : "Creating free account…"
        );
        const refCode = inviteRef || "";
        const result =
          typeof actor.registerWithReferral === "function"
            ? await actor.registerWithReferral(name, bio.trim(), "", refCode)
            : await actor.register(name, bio.trim(), "");
        const text = typeof result === "string" ? result : "";
        if (/^Registered/i.test(text) || /referral reward/i.test(text)) {
          clearInviteRef();
        }
        // Already registered is OK — still provision site
        const regOk =
          /^Registered/i.test(text) ||
          /success/i.test(text) ||
          /Already registered/i.test(text) ||
          /referral reward/i.test(text);
        if (!regOk) {
          setError(text || "Registration failed.");
          setStep("");
          setLoading(false);
          return;
        }
        setRegisteredNoSite(true);
      }

      const site = await provisionWebsite(3);
      if (!site.ok) {
        setRegisteredNoSite(true);
        setError(
          site.error +
            "\n\nYou are registered on ICE — Join fee is not charged again. Use “Retry website only” below or open My Site later."
        );
        setStep("");
        if (onRegistered) {
          onRegistered({ registered: true, siteId: null, siteError: site.error });
        }
        setLoading(false);
        return;
      }

      setRegisteredNoSite(false);
      setStep("Website ready!");
      if (onRegistered) {
        onRegistered({ registered: true, siteId: site.siteId });
      }
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
    setLoading(true);
    setError("");
    try {
      const cap = await loadCapacity();
      if (cap && !cap.canMint) {
        setError(cap.message || "Factory cannot mint right now.");
        setLoading(false);
        return;
      }
      const site = await provisionWebsite(3);
      if (!site.ok) {
        setError(site.error);
        setStep("");
      } else {
        setRegisteredNoSite(false);
        setStep("Website ready!");
        if (onRegistered) {
          onRegistered({ registered: true, siteId: site.siteId });
        }
      }
    } catch (e) {
      setError(e?.message || "Retry failed");
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
      {(() => {
        try {
          return sessionStorage.getItem("ice-referral-signup") === "1";
        } catch {
          return false;
        }
      })() && (
        <div
          style={{
            marginBottom: "0.85rem",
            padding: "0.75rem 0.85rem",
            borderRadius: 12,
            background:
              "linear-gradient(155deg, rgba(8, 24, 42, 0.9), rgba(30, 27, 55, 0.75))",
            border: "1px solid rgba(125, 211, 252, 0.4)",
            boxShadow: "0 0 24px rgba(56, 189, 248, 0.12)",
            color: "#bae6fd",
            fontSize: "0.85rem",
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: "#e0f2fe" }}>ICE referral program</strong>
          <div style={{ marginTop: "0.35rem" }}>
            You&apos;re registered with Internet Identity. Copy your invite link below, share it,
            and when 15 users Join and get canister sites through your link, come back here for{" "}
            <strong style={{ color: "#7dd3fc" }}>free Join + site</strong>. You do not need to pay
            Join to start inviting.
          </div>
        </div>
      )}
      <InviteCard actor={actor} identity={identity} />
      {rewardFree && (
        <div
          style={{
            marginBottom: "0.85rem",
            padding: "0.65rem 0.75rem",
            borderRadius: 10,
            background: "rgba(22, 101, 52, 0.35)",
            border: "1px solid rgba(74, 222, 128, 0.4)",
            color: "#86efac",
            fontSize: "0.85rem",
            fontWeight: 600,
          }}
        >
          Referral reward unlocked — free Join + website (no ICP).
        </div>
      )}
      {inviteRef && !rewardFree && (
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.78rem", color: "#94a3b8" }}>
          Joining via invite{" "}
          <code style={{ color: "#cbd5e1" }}>{inviteRef.slice(0, 14)}…</code>
        </p>
      )}
      <h2 className="ice-title" style={{ marginTop: 0 }}>
        Create your account
      </h2>

      <div
        style={{
          display: "flex",
          gap: "0.4rem",
          marginBottom: "0.85rem",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className={joinPath === "new" ? "ice-btn-primary" : "ice-btn"}
          onClick={() => {
            setJoinPath("new");
            setError("");
          }}
          style={{ flex: "1 1 8rem", fontSize: "0.82rem" }}
        >
          I’m new
        </button>
        <button
          type="button"
          className={joinPath === "returning" ? "ice-btn-primary" : "ice-btn"}
          onClick={() => {
            setJoinPath("returning");
            setError("");
            setAckNoPriorAccount(false);
          }}
          style={{ flex: "1 1 8rem", fontSize: "0.82rem" }}
        >
          I already have an account
        </button>
      </div>

      {joinPath === "returning" ? (
        <div
          style={{
            margin: "0 0 1rem",
            padding: "0.85rem 0.9rem",
            borderRadius: 12,
            background: "rgba(120, 53, 15, 0.28)",
            border: "1px solid rgba(251, 191, 36, 0.4)",
          }}
        >
          <p style={{ margin: "0 0 0.55rem", color: "#fde68a", fontWeight: 700, fontSize: "0.9rem" }}>
            Do not pay Join or create another website
          </p>
          <p style={{ margin: "0 0 0.65rem", color: "#cbd5e1", fontSize: "0.8rem", lineHeight: 1.45 }}>
            Signing in on a different ICE URL can show a <em>new</em> principal even with the same
            Internet Identity. Your original site stays on the original principal. Paste that
            principal to check it, then sign in on the canonical app with the <strong>same</strong>{" "}
            II — that returns your real account (no second canister).
          </p>
          <label style={{ ...labelStyle, color: "#fde68a" }}>Original principal</label>
          <input
            value={priorPrincipal}
            onChange={(e) => {
              setPriorPrincipal(e.target.value);
              setPriorLookup(null);
            }}
            placeholder="e.g. gmtr2-… or your earlier ICE principal"
            style={inputStyle}
            disabled={priorLooking}
          />
          <button
            type="button"
            className="ice-btn"
            onClick={lookupPriorAccount}
            disabled={priorLooking || !priorPrincipal.trim()}
            style={{ width: "100%", marginTop: "0.5rem" }}
          >
            {priorLooking ? "Checking…" : "Look up this account"}
          </button>
          {priorLookup && (
            <div
              style={{
                marginTop: "0.65rem",
                padding: "0.55rem 0.65rem",
                borderRadius: 8,
                background: priorLookup.ok ? "rgba(22, 101, 52, 0.3)" : "rgba(127, 29, 29, 0.35)",
                border: priorLookup.ok
                  ? "1px solid rgba(74, 222, 128, 0.35)"
                  : "1px solid rgba(248, 113, 113, 0.4)",
                color: priorLookup.ok ? "#86efac" : "#fecaca",
                fontSize: "0.78rem",
                lineHeight: 1.45,
              }}
            >
              {priorLookup.ok ? (
                <>
                  Found
                  {priorLookup.registered ? " · registered on ICE" : ""}
                  {priorLookup.siteId ? (
                    <>
                      {" "}
                      · site{" "}
                      <code style={{ color: "#e2e8f0", wordBreak: "break-all" }}>
                        {priorLookup.siteId}
                      </code>
                    </>
                  ) : (
                    " · no site linked yet"
                  )}
                  . Next: open the canonical app and sign in with the same II.
                </>
              ) : (
                priorLookup.error
              )}
            </div>
          )}
          <a
            href={CANONICAL_APP_URL}
            className="ice-btn-primary"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              marginTop: "0.75rem",
              textDecoration: "none",
              boxSizing: "border-box",
            }}
          >
            Verify — open canonical app
          </a>
          <p style={{ margin: "0.55rem 0 0", fontSize: "0.72rem", color: "#94a3b8", lineHeight: 1.4 }}>
            Canonical: <code style={{ color: "#e2e8f0" }}>{CANONICAL_APP_URL}</code>
          </p>
          {onCancel && (
            <button
              type="button"
              className="ice-btn"
              onClick={onCancel}
              style={{ width: "100%", marginTop: "0.55rem" }}
            >
              Back — keep browsing
            </button>
          )}
        </div>
      ) : (
        <>
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
        }}
      >
        Create a free username to post on ICE. Your personal site canister is optional —{" "}
        <strong style={{ color: "#fbbf24" }}>10 ICP at mint</strong> pays for your canister and
        keeps the network running.
      </p>
      <p
        style={{
          margin: "0 0 0.85rem",
          padding: "0.5rem 0.65rem",
          borderRadius: 8,
          background: "rgba(30, 58, 95, 0.35)",
          border: "1px solid rgba(125, 211, 252, 0.25)",
          color: "#94a3b8",
          fontSize: "0.75rem",
          lineHeight: 1.45,
        }}
      >
        <strong style={{ color: "#7dd3fc" }}>Avoid a second website:</strong> if you already Joined
        ICE before, choose <strong style={{ color: "#e2e8f0" }}>I already have an account</strong>{" "}
        above. Prefer signing in at{" "}
        <code style={{ color: "#e2e8f0" }}>{CANONICAL_APP_URL}</code> so you keep one principal.
      </p>

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
          <strong>Factory mint status:</strong>{" "}
          {canMint ? "Ready" : "Blocked"}
          <div style={{ marginTop: "0.25rem", opacity: 0.95 }}>
            {capacity.message}
          </div>
          <div style={{ marginTop: "0.2rem", fontSize: "0.72rem", opacity: 0.85 }}>
            Cycles: {formatCycles(capacity.factoryCycles)}
            {capacity.minRequired != null && (
              <> · need {formatCycles(capacity.minRequired)}</>
            )}
          </div>
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
        <strong>Already paid mint?</strong> Do <em>not</em> approve ICP again. Log out and log back in
        (same II). If registered but no website, use “Retry website only” (no second mint fee if pending).
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
      <p style={{ color: "#94a3b8", fontSize: "0.9rem", lineHeight: 1.5 }}>
        {isMaster ? (
          <>Master account — registration is free. Your personal website canister is created next.</>
        ) : (
          <>
            Username is free. Personal site mint
            {mustPay ? (
              <>
                :{" "}
                <strong style={{ color: "#fbbf24" }}>{feeIcp} ICP</strong> once (
                {cyclesIcp} ICP → your canister cycles, {opsIcp} ICP → network ops). Approve with II
                before mint.
              </>
            ) : (
              <> is free for you</>
            )}
            .
          </>
        )}
      </p>

      <ol style={{ color: "#64748b", fontSize: "0.8rem", lineHeight: 1.55, paddingLeft: "1.2rem" }}>
        <li>Free username on ICE (post without a site if you want)</li>
        {mustPay && (
          <li>
            Approve {feeIcp} ICP mint fee to Factory ({cyclesIcp} cycles / {opsIcp} network)
          </li>
        )}
        <li>Personal site canister created and linked (auto-retry if mint is busy)</li>
      </ol>
      <p style={{ color: "#475569", fontSize: "0.75rem", lineHeight: 1.45 }}>
        After joining you can tip others in ICP (when tipping is enabled) from profiles.
        {anyActionFeeOn
          ? " Deposit ICP under the ICP tab for post, love, or message fees."
          : null}
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

      {!isMaster && !registeredNoSite && (
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
            I confirm I do <strong>not</strong> already have an ICE account or personal website. If
            you might, use <em>I already have an account</em> instead — joining again can mint a
            second canister and charge mint again.
          </span>
        </label>
      )}

      {mustPay && !isMaster && mayCreateNew && (
        <NnsIcpFee
          identity={identity}
          feeE8s={BigInt(feeE8s)}
          spenderCanisterId={FACTORY_CANISTER_ID}
          purpose={`site mint (${cyclesIcp} ICP canister cycles + ${opsIcp} ICP network)`}
          onReadyChange={onFeeReady}
        />
      )}

      <form onSubmit={handleRegister}>
        <label style={labelStyle}>Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Unique username"
          maxLength={50}
          style={inputStyle}
          disabled={loading || registeredNoSite || !mayCreateNew}
        />

        <label style={labelStyle}>Bio (optional)</label>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Short bio"
          rows={2}
          maxLength={300}
          style={{ ...inputStyle, resize: "vertical" }}
          disabled={loading || registeredNoSite || !mayCreateNew}
        />

        {onCancel && (
          <button
            type="button"
            className="ice-btn"
            disabled={loading}
            onClick={onCancel}
            style={{ width: "100%", marginTop: "0.75rem" }}
          >
            Back — keep browsing (no payment)
          </button>
        )}

        {!registeredNoSite && (
          <button
            type="submit"
            className="ice-btn-primary"
            disabled={loading || !username.trim() || !canSubmit}
            style={{
              width: "100%",
              marginTop: "0.65rem",
              opacity: !canSubmit ? 0.55 : 1,
            }}
          >
            {loading
              ? step || "Working…"
              : !mayCreateNew
              ? "Confirm you’re new (checkbox) first"
              : !canMint
              ? "Join blocked — factory cannot mint"
              : mustPay && !nnsFeeReady
              ? "Approve mint fee with II, then continue"
              : mustPay
              ? `Create account + mint site (${feeIcp} ICP)`
              : isMaster
              ? "Create master account + website"
              : "Create your account"}
          </button>
        )}
      </form>

      {registeredNoSite && (
        <button
          type="button"
          className="ice-btn-primary"
          disabled={loading || !canMint || (mustPay && !nnsFeeReady)}
          onClick={retrySiteOnly}
          style={{ width: "100%", marginTop: "0.75rem" }}
        >
          {loading
            ? step || "Retrying website…"
            : mustPay && !nnsFeeReady
            ? "Approve mint fee to retry site"
            : "Retry website only (no second mint if pending)"}
        </button>
      )}

      {siteId && (
        <div
          className="ice-glass-soft"
          style={{
            marginTop: "1rem",
            padding: "0.85rem",
            border: "1px solid rgba(56, 189, 248, 0.35)",
          }}
        >
          <div style={{ fontSize: "0.7rem", color: "#7dd3fc", fontWeight: 700, letterSpacing: "0.06em" }}>
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
              <p style={{ margin: "0.45rem 0 0", fontSize: "0.75rem", color: "#94a3b8" }}>
                If login later uses a different II principal, paste this code under My Site → Transfer
                → Recover.
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
