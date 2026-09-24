import React, { useState, useEffect, useCallback } from "react";
import { Principal } from "@dfinity/principal";
import {
  createFactoryActor,
  createUserSiteActor,
  ASSETS_CANISTER_ID,
  FACTORY_CANISTER_ID,
} from "./actors";
import {
  approveFactoryPayment,
  formatIcp,
  ONE_ICP_E8S,
} from "./icpLedger";
import { normalizeDomainHost, validateDomainWithIcp } from "./icpDomainValidate";

const DEFAULT_DOMAIN_FEE = ONE_ICP_E8S; // 1 ICP

/**
 * One-screen custom domain:
 * 1) Enter domain → exact DNS records shown
 * 2) Connect Domain → ICRC-2 approve + charge 1 ICP + set_domain
 * 3) Check DNS → live verify + enable HTTPS / detach-ready
 */
export default function SiteDomainDns({ identity, siteId, linked: _linked, onStatusChange }) {
  const [domain, setDomain] = useState("");
  const [savedDomain, setSavedDomain] = useState("");
  const [dnsConfigured, setDnsConfigured] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [feeE8s, setFeeE8s] = useState(DEFAULT_DOMAIN_FEE);
  const [validateOk, setValidateOk] = useState(false);

  const host = normalizeDomainHost(domain) || "";
  const connectedHost = normalizeDomainHost(savedDomain) || "";
  const domainConnected = !!connectedHost && connectedHost === host;

  const load = useCallback(async () => {
    if (!identity || !siteId) return;
    setLoading(true);
    setError("");
    try {
      const factory = await createFactoryActor(identity);
      try {
        if (factory.getFees) {
          const fees = await factory.getFees();
          const f =
            fees?.domainConnectFeeE8s ??
            fees?.domain_connect_fee_e8s ??
            DEFAULT_DOMAIN_FEE;
          setFeeE8s(typeof f === "bigint" ? f : BigInt(f || DEFAULT_DOMAIN_FEE));
        }
      } catch (_) {}

      let rec = null;
      try {
        const opt = await factory.getSiteDomainConnection(Principal.fromText(siteId));
        rec = Array.isArray(opt) ? opt[0] : opt;
      } catch (_) {}

      if (rec) {
        const d = rec.domain || "";
        setDomain(d);
        setSavedDomain(d);
        setDnsConfigured(!!rec.dnsConfigured);
        const isReady = !!(rec.domain && rec.publicUrl && rec.dnsConfigured);
        setReady(isReady);
        setValidateOk(isReady);
        if (onStatusChange) onStatusChange(isReady);
      } else {
        try {
          const site = await createUserSiteActor(identity, siteId);
          if (site.getDomainStatus) {
            const st = await site.getDomainStatus();
            const d = st.customDomain || "";
            setDomain(d);
            setSavedDomain(d);
            setDnsConfigured(!!st.dnsConfigured);
            setReady(!!st.readyForDetach);
            setValidateOk(!!st.readyForDetach);
            if (onStatusChange) onStatusChange(!!st.readyForDetach);
          } else {
            setReady(false);
            if (onStatusChange) onStatusChange(false);
          }
        } catch (_) {
          setReady(false);
          if (onStatusChange) onStatusChange(false);
        }
      }
    } catch (e) {
      console.error(e);
      setError(e?.message || "Could not load domain status");
    } finally {
      setLoading(false);
    }
  }, [identity, siteId, onStatusChange]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    // Editing domain invalidates prior validate for a different host
    if (host && connectedHost && host !== connectedHost) {
      setValidateOk(false);
    }
  }, [host, connectedHost]);

  const handleConnectDomain = async () => {
    if (!identity || !siteId) return;
    const d = normalizeDomainHost(domain);
    if (!d || !d.includes(".")) {
      setError("Enter a domain hostname (e.g. mysite.example.com).");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      setMsg(`Approve ${formatIcp(feeE8s)} ICP for domain…`);
      await approveFactoryPayment(
        identity,
        FACTORY_CANISTER_ID,
        feeE8s,
        "domain connect"
      );

      setMsg("Connecting domain…");
      const factory = await createFactoryActor(identity);
      const result =
        typeof factory.connectDomain === "function"
          ? await factory.connectDomain(d)
          : await factory.setSiteDomainConnection(d, `https://${d}`);

      if (result && "ok" in result) {
        setSavedDomain(d);
        setDnsConfigured(false);
        setReady(false);
        setValidateOk(false);
        setMsg(
          result.ok ||
            `Domain ${d} connected. Add the DNS records below, then press Check DNS.`
        );
        if (onStatusChange) onStatusChange(false);
        await load();
      } else {
        setError((result && result.err) || "Connect Domain failed");
      }
    } catch (e) {
      console.error(e);
      setError(e?.message || "Connect Domain failed");
    } finally {
      setBusy(false);
    }
  };

  const handleCheckDns = async () => {
    if (!identity) return;
    const d = normalizeDomainHost(domain) || connectedHost;
    if (!d) {
      setError("Enter and connect a domain first.");
      return;
    }
    if (!domainConnected && !connectedHost) {
      setError("Press Connect Domain (1 ICP) first, then Check DNS.");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      setMsg(`Checking DNS for ${d}…`);
      // Client-side quick check (helps UX); factory also validates on-chain
      try {
        const v = await validateDomainWithIcp(d);
        if (!v.ok) {
          setValidateOk(false);
          setError(
            `DNS not ready yet (ICP HTTP ${v.status}). Double-check the records below, wait a few minutes for propagation, then try again.\n${(v.body || "").slice(0, 240)}`
          );
          setBusy(false);
          return;
        }
        setValidateOk(true);
      } catch (e) {
        // Continue to factory checkDns — on-chain validate is authoritative
        setMsg("Browser validate unreachable — verifying on-chain…");
      }

      const factory = await createFactoryActor(identity);
      const result =
        factory.checkDns != null
          ? await factory.checkDns()
          : await factory.confirmSiteDns();

      if (result && "ok" in result) {
        setDnsConfigured(true);
        setReady(true);
        setValidateOk(true);
        setMsg(result.ok || `DNS verified. HTTPS enabled for ${d}.`);
        if (onStatusChange) onStatusChange(true);
        await load();
      } else {
        setError((result && result.err) || "Check DNS failed");
      }
    } catch (e) {
      console.error(e);
      setError(e?.message || "Check DNS failed");
    } finally {
      setBusy(false);
    }
  };

  if (!siteId) return null;

  const hostOnly = host || "yourdomain.com";
  const feeLabel = formatIcp(feeE8s);

  return (
    <div
      className="ice-glass"
      style={{
        padding: "1.15rem 1.25rem",
        marginBottom: "1rem",
        border: ready
          ? "1px solid rgba(74, 222, 128, 0.35)"
          : "1px solid rgba(251, 191, 36, 0.35)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "0.5rem",
        }}
      >
        <div
          className="ice-section-title"
          style={{ margin: 0, color: ready ? "#86efac" : "#fbbf24" }}
        >
          Connect Domain
        </div>
        <span className={`ice-status ${ready ? "ice-status-ok" : "ice-status-warn"}`}>
          {ready ? "HTTPS ready" : domainConnected ? "DNS pending" : "Not connected"}
        </span>
      </div>

      <p style={{ margin: "0 0 0.85rem", color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.55 }}>
        One fee ({feeLabel} ICP via Internet Identity). Enter your domain, connect, add the DNS
        records exactly as shown, then Check DNS to enable HTTPS.
      </p>

      {loading ? (
        <p style={{ color: "#64748b", fontSize: "0.85rem" }}>Loading…</p>
      ) : (
        <>
          <label
            style={{
              display: "block",
              color: "#94a3b8",
              fontSize: "0.75rem",
              marginBottom: "0.25rem",
            }}
          >
            Domain
          </label>
          <input
            type="text"
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setValidateOk(false);
            }}
            placeholder="mysite.example.com"
            disabled={busy}
            style={inputStyle}
          />

          {/* Exact DNS records — always shown for the typed host */}
          <div
            style={{
              marginTop: "0.85rem",
              padding: "0.85rem 0.9rem",
              background: "rgba(0,0,0,0.32)",
              borderRadius: 8,
              fontSize: "0.78rem",
              color: "#94a3b8",
              lineHeight: 1.55,
            }}
          >
            <div style={{ color: "#7dd3fc", fontWeight: 700, marginBottom: "0.45rem" }}>
              Exact DNS records
            </div>
            <div style={{ marginBottom: "0.45rem" }}>
              Assets canister:{" "}
              <code style={{ color: "#fbbf24", wordBreak: "break-all" }}>{ASSETS_CANISTER_ID}</code>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
              <thead>
                <tr style={{ color: "#64748b", textAlign: "left" }}>
                  <th style={{ padding: "0.25rem 0.35rem 0.35rem 0" }}>Type</th>
                  <th style={{ padding: "0.25rem 0.35rem 0.35rem" }}>Name / host</th>
                  <th style={{ padding: "0.25rem 0 0.35rem" }}>Value</th>
                </tr>
              </thead>
              <tbody style={{ color: "#e2e8f0" }}>
                <tr>
                  <td style={{ padding: "0.3rem 0.35rem 0.3rem 0", verticalAlign: "top" }}>
                    <strong>TXT</strong>
                  </td>
                  <td style={{ padding: "0.3rem 0.35rem", verticalAlign: "top", wordBreak: "break-all" }}>
                    <code>_canister-id.{hostOnly}</code>
                  </td>
                  <td style={{ padding: "0.3rem 0", verticalAlign: "top", wordBreak: "break-all" }}>
                    <code style={{ color: "#fbbf24" }}>{ASSETS_CANISTER_ID}</code>
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "0.3rem 0.35rem 0.3rem 0", verticalAlign: "top" }}>
                    <strong>CNAME</strong>
                  </td>
                  <td style={{ padding: "0.3rem 0.35rem", verticalAlign: "top", wordBreak: "break-all" }}>
                    <code>{hostOnly}</code>
                  </td>
                  <td style={{ padding: "0.3rem 0", verticalAlign: "top", wordBreak: "break-all" }}>
                    <code>{hostOnly}.icp1.io</code>
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: "0.3rem 0.35rem 0.3rem 0", verticalAlign: "top" }}>
                    <strong>CNAME</strong>
                  </td>
                  <td style={{ padding: "0.3rem 0.35rem", verticalAlign: "top", wordBreak: "break-all" }}>
                    <code>_acme-challenge.{hostOnly}</code>
                  </td>
                  <td style={{ padding: "0.3rem 0", verticalAlign: "top", wordBreak: "break-all" }}>
                    <code>_acme-challenge.{hostOnly}.icp2.io</code>
                  </td>
                </tr>
              </tbody>
            </table>
            <p style={{ margin: "0.55rem 0 0", color: "#64748b", fontSize: "0.72rem" }}>
              Site canister (for ops):{" "}
              <code style={{ color: "#94a3b8", wordBreak: "break-all" }}>{siteId}</code>
              {ready ? (
                <>
                  {" "}
                  · Open{" "}
                  <a
                    href={`https://${hostOnly}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#7dd3fc" }}
                  >
                    https://{hostOnly}
                  </a>
                </>
              ) : null}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              marginTop: "0.9rem",
            }}
          >
            <button
              type="button"
              className="ice-btn-primary"
              disabled={busy || !host}
              onClick={handleConnectDomain}
              title={`Charge ${feeLabel} ICP then set domain`}
            >
              {busy
                ? "Working…"
                : domainConnected
                ? `Reconnect Domain (${feeLabel} if changed)`
                : `Connect Domain (${feeLabel} ICP)`}
            </button>
            <button
              type="button"
              className="ice-btn"
              disabled={busy || (!domainConnected && !connectedHost)}
              onClick={handleCheckDns}
              style={{
                opacity: !domainConnected && !connectedHost ? 0.55 : 1,
                borderColor: ready || validateOk ? "rgba(74,222,128,0.5)" : undefined,
              }}
            >
              {ready ? "DNS verified ✓" : validateOk ? "Check DNS again" : "Check DNS"}
            </button>
            <button type="button" className="ice-btn" disabled={busy || loading} onClick={load}>
              Refresh
            </button>
          </div>
        </>
      )}

      {msg && (
        <p style={{ margin: "0.65rem 0 0", color: "#4ade80", fontSize: "0.8rem", whiteSpace: "pre-wrap" }}>
          {msg}
        </p>
      )}
      {error && (
        <p
          style={{
            margin: "0.65rem 0 0",
            color: "#f87171",
            fontSize: "0.8rem",
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.55rem 0.65rem",
  background: "rgba(9,9,11,0.72)",
  color: "#e2e8f0",
  border: "1px solid rgba(148,163,184,0.22)",
  borderRadius: 8,
  fontFamily: "inherit",
  fontSize: "0.9rem",
};
