import React, { useState, useEffect, useCallback } from "react";
import {
  createFactoryActor,
  ASSETS_CANISTER_ID,
  FACTORY_CANISTER_ID,
} from "./actors";

/**
 * Master tools for personal-site custom domain hosting.
 * Lists domains, exports ic-domains body, validates/registers with ICP API.
 */
export default function MasterHostingControls({ identity }) {
  const [rows, setRows] = useState([]);
  const [icBody, setIcBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [registerDomain, setRegisterDomain] = useState("");
  const [validateOut, setValidateOut] = useState("");

  const load = useCallback(async () => {
    if (!identity) return;
    setLoading(true);
    setErr("");
    try {
      const factory = await createFactoryActor(identity);
      const list = factory.listHostingDomains
        ? await factory.listHostingDomains()
        : [];
      setRows(Array.isArray(list) ? list : []);
      if (factory.getIcDomainsFileBody) {
        setIcBody(await factory.getIcDomainsFileBody());
      }
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Could not load hosting domains");
    } finally {
      setLoading(false);
    }
  }, [identity]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async (text, label) => {
    try {
      await navigator.clipboard?.writeText(text);
      setMsg(`${label} copied.`);
    } catch {
      setMsg("Copy failed — select the text manually.");
    }
  };

  const validateDomain = async (domain) => {
    const d = (domain || "").trim().toLowerCase();
    if (!d) return;
    setBusy(true);
    setValidateOut("");
    setErr("");
    try {
      const res = await fetch(
        `https://icp0.io/custom-domains/v1/${encodeURIComponent(d)}/validate`
      );
      const text = await res.text();
      setValidateOut(`${d}: HTTP ${res.status}\n${text}`);
      setMsg(res.ok ? `Validate returned ${res.status}` : `Validate HTTP ${res.status}`);
    } catch (e) {
      setErr(
        e?.message ||
          "Validate request failed (network/CORS). Use the shell script instead."
      );
    } finally {
      setBusy(false);
    }
  };

  const registerDomainApi = async () => {
    const d = registerDomain.trim().toLowerCase();
    if (!d) {
      setErr("Enter a domain to register.");
      return;
    }
    setBusy(true);
    setErr("");
    setMsg("");
    try {
      const res = await fetch(
        `https://icp0.io/custom-domains/v1/${encodeURIComponent(d)}`,
        { method: "POST" }
      );
      const text = await res.text();
      setValidateOut(`${d} POST: HTTP ${res.status}\n${text}`);
      setMsg(
        res.ok
          ? `Register request accepted (${res.status}). Wait for SSL.`
          : `Register HTTP ${res.status} — check validate + DNS + ic-domains.`
      );
    } catch (e) {
      setErr(
        e?.message ||
          "Register request failed (network/CORS). Run: bash scripts/sync-hosting-domains.sh --register " +
            d
      );
    } finally {
      setBusy(false);
    }
  };

  const assetsIcp0 = `https://${ASSETS_CANISTER_ID}.icp0.io`;

  return (
    <div
      style={{
        marginBottom: "1.5rem",
        padding: "0.9rem 1rem",
        background: "rgba(9, 9, 11, 0.72)",
        borderRadius: "8px",
        border: "1px solid rgba(56, 189, 248, 0.25)",
      }}
    >
      <div style={{ color: "#7dd3fc", fontWeight: 700, fontSize: "0.95rem" }}>
        Custom domain hosting
      </div>
      <p style={{ margin: "0.35rem 0 0.75rem", color: "#94a3b8", fontSize: "0.8rem", lineHeight: 1.5 }}>
        Personal sites are hosted via the assets SPA. Domains must be in{" "}
        <code style={{ color: "#cbd5e1" }}>ic-domains</code>, DNS →{" "}
        <code style={{ color: "#fbbf24" }}>{ASSETS_CANISTER_ID}</code>, then ICP register.
        After changes run:{" "}
        <code style={{ color: "#cbd5e1" }}>bash scripts/sync-hosting-domains.sh</code>
      </p>

      <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: "0.65rem" }}>
        Factory <span className="ice-mono">{FACTORY_CANISTER_ID}</span>
        <br />
        Viewer <a href={assetsIcp0} style={{ color: "#7dd3fc" }}>{assetsIcp0}</a>
      </div>

      {loading ? (
        <p style={{ color: "#64748b", fontSize: "0.85rem" }}>Loading…</p>
      ) : (
        <>
          <div className="ice-section-title" style={{ marginTop: "0.5rem" }}>
            Registered personal domains ({rows.length})
          </div>
          {rows.length === 0 ? (
            <p style={{ color: "#64748b", fontSize: "0.85rem" }}>
              None yet. Owners set domains under My Site → Domain &amp; DNS.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.45rem", marginBottom: "0.85rem" }}>
              {rows.map((r) => {
                const domain = r.domain;
                const site = r.site?.toText?.() || String(r.site);
                return (
                  <div
                    key={domain + site}
                    className="ice-glass-soft"
                    style={{
                      padding: "0.55rem 0.7rem",
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "0.85rem" }}>
                        {domain}{" "}
                        <span
                          className={`ice-status ${
                            r.dnsConfigured ? "ice-status-ok" : "ice-status-warn"
                          }`}
                          style={{ marginLeft: "0.35rem" }}
                        >
                          {r.dnsConfigured ? "DNS ok" : "pending"}
                        </span>
                      </div>
                      <div className="ice-mono" style={{ fontSize: "0.68rem", color: "#64748b" }}>
                        {site}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="ice-btn"
                        disabled={busy}
                        onClick={() => validateDomain(domain)}
                      >
                        Validate
                      </button>
                      <a
                        href={`https://${domain}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ice-btn"
                        style={{ textDecoration: "none" }}
                      >
                        Open
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="ice-section-title">ic-domains file body</div>
          <pre
            style={{
              margin: "0 0 0.5rem",
              padding: "0.65rem",
              background: "rgba(0,0,0,0.35)",
              borderRadius: 8,
              fontSize: "0.72rem",
              color: "#cbd5e1",
              whiteSpace: "pre-wrap",
              maxHeight: 160,
              overflow: "auto",
            }}
          >
            {icBody || "(empty)"}
          </pre>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem", marginBottom: "0.85rem" }}>
            <button type="button" className="ice-btn" onClick={() => copy(icBody, "ic-domains")}>
              Copy ic-domains
            </button>
            <button type="button" className="ice-btn" disabled={busy} onClick={load}>
              Refresh list
            </button>
          </div>

          <div className="ice-section-title">Register domain with ICP</div>
          <p style={{ margin: "0 0 0.45rem", fontSize: "0.75rem", color: "#64748b" }}>
            Deploy ic-domains first (sync script), then register. May fail in-browser if CORS blocks
            the API — use the script as fallback.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
            <input
              type="text"
              value={registerDomain}
              onChange={(e) => setRegisterDomain(e.target.value)}
              placeholder="mysite.example.com"
              disabled={busy}
              style={{
                flex: "1 1 160px",
                padding: "0.45rem 0.6rem",
                background: "rgba(0,0,0,0.4)",
                border: "1px solid rgba(148,163,184,0.25)",
                borderRadius: 8,
                color: "#e2e8f0",
              }}
            />
            <button type="button" className="ice-btn" disabled={busy} onClick={() => validateDomain(registerDomain)}>
              Validate
            </button>
            <button type="button" className="ice-btn-primary" disabled={busy} onClick={registerDomainApi}>
              Register
            </button>
          </div>

          {validateOut && (
            <pre
              style={{
                marginTop: "0.65rem",
                padding: "0.55rem",
                background: "rgba(0,0,0,0.4)",
                borderRadius: 8,
                fontSize: "0.7rem",
                color: "#94a3b8",
                whiteSpace: "pre-wrap",
                maxHeight: 140,
                overflow: "auto",
              }}
            >
              {validateOut}
            </pre>
          )}
        </>
      )}

      {msg && <p style={{ color: "#4ade80", fontSize: "0.8rem", margin: "0.65rem 0 0" }}>{msg}</p>}
      {err && <p style={{ color: "#f87171", fontSize: "0.8rem", margin: "0.65rem 0 0" }}>{err}</p>}
    </div>
  );
}
