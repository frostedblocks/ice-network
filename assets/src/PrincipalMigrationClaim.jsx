import React, { useEffect, useState } from "react";
import { Principal } from "@dfinity/principal";
import { createFactoryActor } from "./actors";

function doneKey(principalText) {
  return `ice-principal-migration-done:${principalText || ""}`;
}

/**
 * One-time principal reset: existing users type their site canister id
 * and claim it to the II they just logged in with.
 * Hidden once this II already owns a factory site (or user dismissed / finished).
 */
export default function PrincipalMigrationClaim({
  identity,
  actor,
  isMaster,
  ownedSites = [],
  onDone,
}) {
  const [open, setOpen] = useState(false);
  const [siteId, setSiteId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const principalText = identity?.getPrincipal?.()?.toText?.() || "";

  useEffect(() => {
    if (!identity || isMaster) {
      setOpen(false);
      return;
    }
    // Already owns a site under this II — migration not needed
    if (Array.isArray(ownedSites) && ownedSites.length > 0) {
      setOpen(false);
      try {
        if (principalText) localStorage.setItem(doneKey(principalText), "1");
      } catch (_) {
        /* ignore */
      }
      return;
    }
    try {
      if (principalText && localStorage.getItem(doneKey(principalText)) === "1") {
        setOpen(false);
        return;
      }
    } catch (_) {
      /* ignore */
    }

    let cancelled = false;
    (async () => {
      try {
        const factory = await createFactoryActor(identity);
        const st = await factory.getPrincipalMigrationStatus?.();
        if (!st?.open) {
          if (!cancelled) setOpen(false);
          return;
        }
        // Double-check live ownership (ownedSites prop may lag one tick)
        if (factory.listMySites) {
          const sites = await factory.listMySites();
          if (sites && sites.length > 0) {
            if (!cancelled) setOpen(false);
            try {
              if (principalText) localStorage.setItem(doneKey(principalText), "1");
            } catch (_) {
              /* ignore */
            }
            return;
          }
        }
        if (!cancelled) setOpen(true);
      } catch {
        if (!cancelled) setOpen(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [identity, isMaster, ownedSites, principalText]);

  if (!open || !identity || isMaster) return null;

  const markDoneAndClose = () => {
    setOpen(false);
    try {
      if (principalText) localStorage.setItem(doneKey(principalText), "1");
    } catch (_) {
      /* ignore */
    }
  };

  const claim = async () => {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const factory = await createFactoryActor(identity);
      const site = Principal.fromText(siteId.trim());
      const result = await factory.claimSiteByCanisterId(site);
      if (result?.err) {
        // Already claimed by this II counts as success for UX
        if (/already claimed this site|Already the registered owner/i.test(result.err)) {
          setMsg(result.err);
          markDoneAndClose();
          if (typeof onDone === "function") await onDone();
          return;
        }
        setErr(result.err);
        return;
      }
      setMsg(result?.ok || "Site claimed.");
      if (actor?.completePrincipalMigration) {
        try {
          const iceMsg = await actor.completePrincipalMigration();
          setMsg((m) => `${m} ${typeof iceMsg === "string" ? iceMsg : ""}`);
        } catch (e) {
          console.error(e);
        }
      }
      markDoneAndClose();
      if (typeof onDone === "function") await onDone();
    } catch (e) {
      setErr(e?.message || "Claim failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="ice-glass"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 90,
        background: "rgba(0,0,0,0.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        className="ice-glass"
        style={{
          maxWidth: 480,
          width: "100%",
          padding: "1.35rem 1.4rem",
          border: "1px solid rgba(251,191,36,0.4)",
        }}
      >
        <h2 style={{ margin: "0 0 0.4rem", color: "#fde68a", fontSize: "1.15rem" }}>
          One-time account fix
        </h2>
        <p style={{ margin: "0 0 0.85rem", fontSize: "0.85rem", color: "#94a3b8", lineHeight: 1.5 }}>
          Existing members only: you are signed in with Internet Identity. Enter the{" "}
          <strong style={{ color: "#e2e8f0" }}>personal website canister id</strong> you were given
          when you Joined (ends in <code>-cai</code>). This remaps that site to{" "}
          <strong style={{ color: "#e2e8f0" }}>this</strong> login. Each site can be claimed once.
          Masters do not use this.
        </p>
        <input
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          placeholder="e.g. scir3-oiaaa-aaaas-qgxsq-cai"
          style={{
            width: "100%",
            marginBottom: "0.65rem",
            padding: "0.55rem 0.65rem",
            borderRadius: 8,
            border: "1px solid rgba(148,163,184,0.28)",
            background: "rgba(9,9,11,0.75)",
            color: "#e2e8f0",
            fontFamily: "ui-monospace, monospace",
            fontSize: "0.85rem",
          }}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            type="button"
            className="ice-btn-primary"
            disabled={busy || !siteId.trim()}
            onClick={claim}
          >
            {busy ? "Claiming…" : "Claim my canister"}
          </button>
          <button
            type="button"
            className="ice-btn"
            disabled={busy}
            onClick={markDoneAndClose}
          >
            Skip for now
          </button>
        </div>
        {msg && (
          <p style={{ color: "#86efac", fontSize: "0.82rem", marginTop: "0.75rem", whiteSpace: "pre-wrap" }}>
            {msg}
          </p>
        )}
        {err && (
          <p style={{ color: "#f87171", fontSize: "0.82rem", marginTop: "0.75rem" }}>{err}</p>
        )}
      </div>
    </div>
  );
}
