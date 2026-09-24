import React, { useState, useEffect, useCallback } from "react";
import { Principal } from "@dfinity/principal";
import {
  createFactoryActor,
  createUserSiteActor,
  FACTORY_CANISTER_ID,
  publicSiteHash,
} from "./actors";
import { formatIcp } from "./icpLedger";
import SiteCycleGauge, { SITE_LOW_CYCLES_THRESHOLD } from "./SiteCycleGauge";
import SiteControllers from "./SiteControllers";
import SiteDomainDns from "./SiteDomainDns";
import SiteEditor from "./SiteEditor";
import SiteAutoTopUp from "./SiteAutoTopUp";
import SiteTransfer from "./SiteTransfer";
import NnsIcpFee from "./NnsIcpFee";
import {
  isProductionNetwork,
  normalizeDomainHost,
  validateDomainWithIcp,
} from "./icpDomainValidate";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "domain", label: "Connect Domain" },
  { id: "infra", label: "Infrastructure" },
  { id: "network", label: "Network" },
  { id: "transfer", label: "Transfer" },
  { id: "content", label: "Editor" },
];

/**
 * Personal website portal — tabbed, professional layout.
 */
export default function MySite({
  identity,
  onBack,
  activeSiteId = null,
  ownedSites = [],
  onActiveSiteChange,
  onSitesChanged,
}) {
  const [siteId, setSiteId] = useState(null);
  const [linked, setLinked] = useState(false);
  const [owner, setOwner] = useState("");
  const [profile, setProfile] = useState(null);
  const [pages, setPages] = useState([]);
  const [posts, setPosts] = useState([]);
  const [fees, setFees] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [cycleRefreshKey, setCycleRefreshKey] = useState(0);
  const [nnsFeeReady, setNnsFeeReady] = useState(false);
  const [mintFeeReady, setMintFeeReady] = useState(false);
  const [domainReady, setDomainReady] = useState(false);
  const [reattachEligible, setReattachEligible] = useState(false);
  const [siteCyclesLow, setSiteCyclesLow] = useState(false);
  const [siteCyclesBal, setSiteCyclesBal] = useState(null);
  const [tab, setTab] = useState("overview");

  const me = identity ? identity.getPrincipal() : null;

  const onNnsFeeReady = useCallback((r) => setNnsFeeReady(!!r), []);
  const onMintFeeReady = useCallback((r) => setMintFeeReady(!!r), []);
  const onDomainStatus = useCallback((r) => setDomainReady(!!r), []);

  const load = useCallback(async () => {
    if (!identity || !me) return;
    setLoading(true);
    setError("");
    try {
      const factory = await createFactoryActor(identity);

      try {
        const feeCfg = await factory.getFees();
        setFees(feeCfg);
      } catch (_) {
        setFees(null);
      }

      // Prefer session-selected site (multi-site picker), else factory preferred
      let id = null;
      let isLinked = false;
      if (activeSiteId) {
        try {
          const { Principal } = await import("@dfinity/principal");
          id = Principal.fromText(String(activeSiteId));
          isLinked = true;
          if (factory.getUserCanister) {
            const prefOpt = await factory.getUserCanister(me);
            const pref = Array.isArray(prefOpt) ? prefOpt[0] : prefOpt;
            const prefText = pref?.toText?.() || (pref ? String(pref) : "");
            if (prefText && prefText !== String(activeSiteId)) {
              // Still owned, but not the factory "preferred" — treat as linked if siteOwners says so
              isLinked = true;
            }
          }
        } catch (_) {
          id = null;
        }
      }
      if (!id) {
        let idOpt = await factory.getUserCanister(me);
        id = Array.isArray(idOpt) ? idOpt[0] : idOpt;
        isLinked = !!id;
      }

      if (!id) {
        try {
          const lastOpt = await factory.getLastSite(me);
          const last = Array.isArray(lastOpt) ? lastOpt[0] : lastOpt;
          if (last) {
            id = last;
            isLinked = false;
          }
        } catch (_) {}
      }

      if (!id) {
        setSiteId(null);
        setLinked(false);
        setReattachEligible(false);
        setLoading(false);
        return;
      }

      const idText = id.toText ? id.toText() : String(id);
      if (idText === FACTORY_CANISTER_ID || idText === "xfwx3-7yaaa-aaaas-qgxpq-cai") {
        setError("Website link is invalid.");
        setSiteId(null);
        setLoading(false);
        return;
      }
      setSiteId(idText);
      setLinked(isLinked);

      // Registry gate for reattach when detached
      if (!isLinked && factory.isEligibleForReattach) {
        try {
          const ok = await factory.isEligibleForReattach(Principal.fromText(idText));
          setReattachEligible(!!ok);
        } catch (_) {
          setReattachEligible(true); // allow attempt; factory will reject if not minted
        }
      } else {
        setReattachEligible(isLinked);
      }

      const site = await createUserSiteActor(identity, idText);
      const [own, feed] = await Promise.all([site.getOwner(), site.getLocalFeed(30)]);
      setOwner(own?.toText?.() || String(own));
      setPosts(Array.isArray(feed) ? feed : []);
      setCycleRefreshKey((k) => k + 1);

      try {
        const prof = await site.getProfile();
        setProfile(prof);
      } catch (_) {
        setProfile(null);
      }
      try {
        const pg = await site.listPages();
        setPages(Array.isArray(pg) ? pg : []);
      } catch (_) {
        setPages([]);
      }
      try {
        const linkedNet = await site.isLinkedToNetwork();
        if (typeof linkedNet === "boolean") setLinked(linkedNet && isLinked);
      } catch (_) {}
      try {
        const gauge = await site.getCyclesGauge();
        const bal =
          typeof gauge?.balance === "bigint"
            ? gauge.balance
            : BigInt(gauge?.balance ?? 0);
        setSiteCyclesBal(bal);
        setSiteCyclesLow(
          !!gauge?.lowCycles || (bal > 0n && bal < SITE_LOW_CYCLES_THRESHOLD)
        );
      } catch (_) {
        setSiteCyclesLow(false);
        setSiteCyclesBal(null);
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to load personal site.");
    } finally {
      setLoading(false);
    }
  }, [identity, me]);

  useEffect(() => {
    load();
  }, [load, activeSiteId]);

  const mintFeeE8s = Math.round(Number(fees?.mintFeeE8s ?? 1_000_000_000) || 1_000_000_000);
  const mintCyclesE8s = Math.round(Number(fees?.mintCyclesShareE8s ?? 270_000_000) || 270_000_000);
  const mintOpsE8s = Math.round(
    Number(fees?.mintNetworkOpsE8s ?? Math.max(0, mintFeeE8s - mintCyclesE8s)) ||
      Math.max(0, mintFeeE8s - mintCyclesE8s)
  );
  const mustPayMint = mintFeeE8s > 0;

  const handleMintSite = async () => {
    if (!identity) return;
    if (mustPayMint && !mintFeeReady) {
      setError("Approve the 10 ICP mint fee with Internet Identity first.");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const factory = await createFactoryActor(identity);
      const fn = factory.ensureUserSite || factory.createUserSite;
      const result = await fn.call(factory);
      if (result && result.ok) {
        const created = result.ok.toText ? result.ok.toText() : String(result.ok);
        setMsg("Website canister created.");
        setMintFeeReady(false);
        if (typeof onActiveSiteChange === "function") onActiveSiteChange(created);
        if (typeof onSitesChanged === "function") {
          try {
            await onSitesChanged();
          } catch (_) {
            /* optional */
          }
        }
        await load();
      } else {
        setError(
          ((result && result.err) || "Mint failed.") +
            "\n\nIf Factory already charged and the canister was created, ICP is held for resume — use Mint site again (no second charge while pending). If charge failed before create, you were refunded."
        );
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Mint failed");
    } finally {
      setBusy(false);
    }
  };

  const handleDetach = async () => {
    if (
      !identity ||
      !window.confirm(
        "Detach this site from the ICE network? Requires domain + DNS (live ICP validate). Your canister stays intact and you can reattach later if it was factory-minted."
      )
    ) {
      return;
    }
    if (!domainReady) {
      setError("Connect a public URL and confirm DNS before detach.");
      setTab("domain");
      return;
    }
    if (siteCyclesLow) {
      setError(
        "Detach blocked: site cycles are low (under ~2 T). Top up via NNS under Infrastructure first so the site does not freeze after leaving the network."
      );
      setTab("infra");
      return;
    }
    if (!nnsFeeReady) {
      setError("Approve the detach fee with Internet Identity first.");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      // T10: live DNS integrity re-check before charging detach fee
      const factory = await createFactoryActor(identity);
      let domainHost = "";
      try {
        const opt = await factory.getSiteDomainConnection(Principal.fromText(siteId));
        const rec = Array.isArray(opt) ? opt[0] : opt;
        if (rec) {
          domainHost = normalizeDomainHost(rec.domain || "");
          const urlHost = normalizeDomainHost(rec.publicUrl || "");
          if (domainHost && urlHost && domainHost !== urlHost) {
            setError(
              `Detach blocked: public URL host (${urlHost}) does not match domain (${domainHost}). Fix under Domain & DNS.`
            );
            setTab("domain");
            setBusy(false);
            return;
          }
        }
      } catch (_) {}

      if (domainHost && isProductionNetwork()) {
        setMsg(`Checking ICP DNS validate for ${domainHost}…`);
        try {
          const v = await validateDomainWithIcp(domainHost);
          if (!v.ok) {
            setError(
              `Detach blocked: ICP domain validate failed (HTTP ${v.status}) for ${domainHost}. Re-check DNS under Domain & DNS, then try again.\n${(v.body || "").slice(0, 200)}`
            );
            setTab("domain");
            setBusy(false);
            return;
          }
        } catch (e) {
          setError(
            e?.message ||
              "Detach blocked: could not reach ICP validate API. Fix connectivity and retry."
          );
          setBusy(false);
          return;
        }
      }

      setMsg("Charging ICP & detaching…");
      const result = await factory.detach();
      if (result && "ok" in result) {
        setMsg(result.ok);
        setNnsFeeReady(false);
        await load();
      } else {
        setError((result && result.err) || "Detach failed");
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Detach failed");
    } finally {
      setBusy(false);
    }
  };

  const handleReattach = async () => {
    if (!identity || !siteId) return;
    if (!reattachEligible) {
      setError("Reattach rejected: this canister is not in the ICE Factory mint Registry.");
      return;
    }
    if (!nnsFeeReady) {
      setError("Approve the reattach fee with Internet Identity first.");
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const factory = await createFactoryActor(identity);
      setMsg("Charging ICP & reattaching…");
      const result = await factory.relink([Principal.fromText(siteId)]);
      if (result && "ok" in result) {
        setMsg(result.ok);
        setNnsFeeReady(false);
        await load();
      } else {
        setError((result && result.err) || "Reattach failed");
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Reattach failed");
    } finally {
      setBusy(false);
    }
  };

  const candidUrl = siteId
    ? `https://a4gq6-oaaaa-aaaab-qaa4q-cai.raw.icp0.io/?id=${siteId}`
    : null;

  const publicUrl = siteId
    ? `${window.location.origin}${window.location.pathname}${publicSiteHash(siteId)}`
    : null;

  const copyId = () => {
    if (!siteId) return;
    navigator.clipboard?.writeText(siteId);
    setMsg("Canister ID copied.");
  };

  const copyPublicLink = () => {
    if (!publicUrl) return;
    navigator.clipboard?.writeText(publicUrl);
    setMsg("Public site link copied.");
  };

  const openPublicSite = () => {
    if (!siteId) return;
    window.location.hash = publicSiteHash(siteId);
  };

  const detachFee = fees ? fees.detachFeeE8s : 10_000_000n;
  const relinkFee = fees ? fees.relinkFeeE8s : 10_000_000n;

  return (
    <div className="ice-mysite">
      <div className="ice-page-header">
        <div>
          <h2>My Site</h2>
          <p className="ice-page-desc">
            Your personal website on ICE — domain, cycles, network link, and site editor.
          </p>
        </div>
        <div className="ice-page-actions">
          {onBack && (
            <button type="button" onClick={onBack} className="ice-btn">
              ← Feed
            </button>
          )}
          <button type="button" onClick={load} className="ice-btn" disabled={loading || busy}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div className="ice-alert-error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}
      {msg && (
        <p className="ice-alert-ok" style={{ marginBottom: "0.85rem" }}>
          {msg}
        </p>
      )}

      {loading && !siteId ? (
        <div className="ice-loading">Loading your website…</div>
      ) : !siteId ? (
        <div className="ice-glass" style={{ padding: "1.15rem 1.2rem" }}>
          <h3 style={{ margin: "0 0 0.4rem", color: "#f8fafc" }}>No site yet</h3>
          <p style={{ margin: "0 0 0.75rem", color: "#94a3b8", fontSize: "0.88rem", lineHeight: 1.5 }}>
            Your username is free. Minting a personal site is optional —{" "}
            <strong style={{ color: "#fbbf24" }}>{formatIcp(mintFeeE8s)} ICP</strong> once (
            {formatIcp(mintCyclesE8s)} ICP canister cycles / {formatIcp(mintOpsE8s)} ICP network ops).
          </p>
          {mustPayMint && identity && (
            <NnsIcpFee
              identity={identity}
              feeE8s={BigInt(mintFeeE8s)}
              spenderCanisterId={FACTORY_CANISTER_ID}
              purpose={`site mint (${formatIcp(mintCyclesE8s)} ICP canister cycles + ${formatIcp(mintOpsE8s)} ICP network)`}
              onReadyChange={onMintFeeReady}
            />
          )}
          <button
            type="button"
            className="ice-btn-primary"
            style={{ marginTop: "0.75rem" }}
            disabled={busy || (mustPayMint && !mintFeeReady)}
            onClick={handleMintSite}
          >
            {busy
              ? "Minting site…"
              : mustPayMint && !mintFeeReady
              ? `Approve ${formatIcp(mintFeeE8s)} ICP, then mint site`
              : `Mint site (${formatIcp(mintFeeE8s)} ICP · ${formatIcp(mintCyclesE8s)} / ${formatIcp(mintOpsE8s)})`}
          </button>
        </div>
      ) : (
        <>
          {Array.isArray(ownedSites) && ownedSites.length > 1 && (
            <div className="ice-mysite-switcher" role="group" aria-label="Switch website">
              <span className="ice-mysite-switcher-label">Websites</span>
              {ownedSites.map((sid) => {
                const active =
                  String(siteId) === String(sid) || String(activeSiteId) === String(sid);
                return (
                  <button
                    key={sid}
                    type="button"
                    className={active ? "ice-btn-primary" : "ice-btn"}
                    onClick={() => {
                      if (typeof onActiveSiteChange === "function") onActiveSiteChange(sid);
                    }}
                  >
                    {String(sid).slice(0, 8)}…{String(sid).slice(-5)}
                  </button>
                );
              })}
            </div>
          )}

          <div className="ice-stat-grid">
            <div className="ice-stat">
              <div className="ice-stat-label">Network</div>
              <div className="ice-stat-value">
                <span className={`ice-status ${linked ? "ice-status-ok" : "ice-status-muted"}`}>
                  {linked ? "Linked" : "Detached"}
                </span>
              </div>
            </div>
            <div className="ice-stat">
              <div className="ice-stat-label">Domain & DNS</div>
              <div className="ice-stat-value">
                <span className={`ice-status ${domainReady ? "ice-status-ok" : "ice-status-warn"}`}>
                  {domainReady ? "Ready" : "Setup needed"}
                </span>
              </div>
            </div>
            <div className="ice-stat">
              <div className="ice-stat-label">Cycles</div>
              <div className="ice-stat-value">
                <span
                  className={`ice-status ${
                    siteCyclesLow ? "ice-status-warn" : siteCyclesBal != null ? "ice-status-ok" : "ice-status-muted"
                  }`}
                >
                  {siteCyclesLow
                    ? "Low"
                    : siteCyclesBal != null
                    ? "Healthy"
                    : "Check infra"}
                </span>
              </div>
            </div>
            <div className="ice-stat">
              <div className="ice-stat-label">Profile</div>
              <div className="ice-stat-value" style={{ fontSize: "0.9rem" }}>
                {profile?.username || "—"}
              </div>
            </div>
          </div>

          <nav className="ice-tabs" aria-label="Site sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ice-tab${tab === t.id ? " is-active" : ""}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === "domain" && (
                  <span className={`ice-tab-badge${domainReady ? " ok" : ""}`}>
                    {domainReady ? "OK" : "!"}
                  </span>
                )}
                {t.id === "infra" && siteCyclesLow && (
                  <span className="ice-tab-badge">!</span>
                )}
              </button>
            ))}
          </nav>

          {tab === "overview" && (
            <section className="ice-section">
              <div className="ice-mysite-hero">
                <div className="ice-mysite-hero-top">
                  <div>
                    <p className="ice-mysite-kicker">Website canister</p>
                    <p className="ice-mysite-canister">{siteId}</p>
                    <p className="ice-mysite-meta">
                      {linked
                        ? "Linked to the ICE factory registry. You remain a controller of this canister."
                        : "Detached from the network index. Your canister is intact — reattach from Network if it was factory-minted."}
                    </p>
                  </div>
                  <div className="ice-mysite-pills">
                    <span className={`ice-status ${linked ? "ice-status-ok" : "ice-status-muted"}`}>
                      {linked ? "Linked" : "Detached"}
                    </span>
                    <span
                      className={`ice-status ${domainReady ? "ice-status-ok" : "ice-status-warn"}`}
                    >
                      {domainReady ? "DNS ready" : "DNS needed"}
                    </span>
                  </div>
                </div>

                {me && (
                  <p className="ice-mysite-meta" style={{ marginTop: 0 }}>
                    Your II:{" "}
                    <span className="ice-mono" style={{ color: "#cbd5e1" }}>
                      {me.toText()}
                    </span>
                  </p>
                )}

                <div className="ice-mysite-actions">
                  <button type="button" className="ice-btn-primary" onClick={openPublicSite}>
                    View public site
                  </button>
                  <button type="button" className="ice-btn" onClick={copyPublicLink}>
                    Copy public link
                  </button>
                  <button type="button" className="ice-btn" onClick={copyId}>
                    Copy canister ID
                  </button>
                  {candidUrl && (
                    <a
                      href={candidUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ice-btn"
                      style={{ textDecoration: "none" }}
                    >
                      Candid UI
                    </a>
                  )}
                  <button type="button" className="ice-btn" onClick={() => setTab("domain")}>
                    {domainReady ? "Domain" : "Set up domain"}
                  </button>
                  <button type="button" className="ice-btn" onClick={() => setTab("infra")}>
                    Infrastructure
                  </button>
                  <button type="button" className="ice-btn" onClick={() => setTab("content")}>
                    Site editor
                  </button>
                </div>

                {publicUrl && (
                  <p className="ice-mysite-link">
                    Public URL:{" "}
                    <a href={publicUrl}>{publicUrl}</a>
                  </p>
                )}
              </div>

              {owner && (
                <div className="ice-panel" style={{ marginTop: "0.85rem" }}>
                  <p className="ice-mysite-kicker">Owner</p>
                  <span className="ice-mono" style={{ fontSize: "0.8rem", color: "#e2e8f0" }}>
                    {owner}
                  </span>
                  {profile?.bio && (
                    <p className="ice-mysite-meta">{profile.bio}</p>
                  )}
                  {profile?.username && (
                    <p className="ice-mysite-meta" style={{ marginTop: "0.35rem" }}>
                      Site profile: <strong style={{ color: "#e2e8f0" }}>{profile.username}</strong>
                      {posts.length ? ` · ${posts.length} local posts` : ""}
                    </p>
                  )}
                </div>
              )}
            </section>
          )}

          {tab === "domain" && (
            <section className="ice-section">
              <SiteDomainDns
                identity={identity}
                siteId={siteId}
                linked={linked}
                onStatusChange={onDomainStatus}
              />
            </section>
          )}

          {tab === "infra" && (
            <section className="ice-section ice-infra-stack">
              <SiteCycleGauge
                identity={identity}
                siteId={siteId}
                ownedSites={ownedSites}
                refreshKey={cycleRefreshKey}
                busy={busy}
                onBalance={({ balance, low }) => {
                  setSiteCyclesBal(balance);
                  setSiteCyclesLow(!!low);
                }}
              />
              <SiteAutoTopUp identity={identity} linked={linked} />
              <SiteControllers identity={identity} siteId={siteId} />
            </section>
          )}

          {tab === "transfer" && (
            <section className="ice-section">
              <SiteTransfer
                identity={identity}
                siteId={siteId}
                linked={linked}
                onChanged={async () => {
                  setCycleRefreshKey((k) => k + 1);
                  await load();
                  if (typeof onSitesChanged === "function") await onSitesChanged();
                }}
              />
            </section>
          )}

          {tab === "network" && (
            <section className="ice-section">
              <div className="ice-glass" style={{ padding: "1.15rem 1.25rem" }}>
                {linked ? (
                  <>
                    <div className="ice-section-title">Detach from ICE</div>
                    <h3 style={{ margin: "0 0 0.4rem", color: "#f8fafc", fontSize: "1.05rem" }}>
                      Leave the network index
                    </h3>
                    <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.55 }}>
                      Unlinks your site from the factory registry. Your canister keeps running with
                      the same controllers and data. The mint Registry still records that this site
                      was created by ICE so you can reattach later.{" "}
                      <strong style={{ color: "#fbbf24" }}>Domain &amp; DNS must be complete first.</strong>
                    </p>
                    {!domainReady && (
                      <p
                        style={{
                          margin: "0.75rem 0 0",
                          color: "#fbbf24",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                        }}
                      >
                        Detach locked —{" "}
                        <button type="button" className="ice-link" onClick={() => setTab("domain")}>
                          complete Domain &amp; DNS
                        </button>
                        .
                      </p>
                    )}
                    {siteCyclesLow && (
                      <p
                        style={{
                          margin: "0.75rem 0 0",
                          color: "#f87171",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          lineHeight: 1.45,
                        }}
                      >
                        Detach locked — site cycles are low
                        {siteCyclesBal != null
                          ? ` (${(Number(siteCyclesBal) / 1e12).toFixed(2)} T)`
                          : ""}
                        .{" "}
                        <button type="button" className="ice-link" onClick={() => setTab("infra")}>
                          Top up under Infrastructure
                        </button>{" "}
                        before detaching so the canister does not freeze offline.
                      </p>
                    )}
                    {identity && domainReady && !siteCyclesLow && (
                      <div style={{ marginTop: "1rem" }}>
                        <NnsIcpFee
                          identity={identity}
                          feeE8s={BigInt(detachFee)}
                          spenderCanisterId={FACTORY_CANISTER_ID}
                          purpose="detach fee"
                          onReadyChange={onNnsFeeReady}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      className="ice-btn"
                      style={{ marginTop: "0.75rem" }}
                      disabled={busy || !domainReady || siteCyclesLow || !nnsFeeReady}
                      onClick={handleDetach}
                    >
                      {busy
                        ? "Working…"
                        : !domainReady
                        ? "Connect domain & DNS first"
                        : siteCyclesLow
                        ? "Top up site cycles first"
                        : !nnsFeeReady
                        ? "Approve fee with II first"
                        : `Detach (${formatIcp(detachFee)} ICP)`}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="ice-section-title">Reattach to ICE</div>
                    <h3 style={{ margin: "0 0 0.4rem", color: "#f8fafc", fontSize: "1.05rem" }}>
                      Rejoin the network
                    </h3>
                    <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.55 }}>
                      Re-adds this canister to the ICE factory index. Only canisters recorded in the
                      Factory mint Registry may reattach — foreign canisters are rejected.
                    </p>
                    {!reattachEligible && (
                      <p
                        style={{
                          margin: "0.75rem 0 0",
                          color: "#f87171",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                        }}
                      >
                        Not eligible: Registry has no mint record for this canister ID.
                      </p>
                    )}
                    {reattachEligible && identity && (
                      <div style={{ marginTop: "1rem" }}>
                        <NnsIcpFee
                          identity={identity}
                          feeE8s={BigInt(relinkFee)}
                          spenderCanisterId={FACTORY_CANISTER_ID}
                          purpose="reattach fee"
                          onReadyChange={onNnsFeeReady}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      className="ice-btn-primary"
                      style={{ marginTop: "0.75rem" }}
                      disabled={busy || !reattachEligible || !nnsFeeReady}
                      onClick={handleReattach}
                    >
                      {busy
                        ? "Working…"
                        : !reattachEligible
                        ? "Not factory-minted"
                        : !nnsFeeReady
                        ? "Approve fee with II first"
                        : `Reattach (${formatIcp(relinkFee)} ICP)`}
                    </button>
                  </>
                )}
              </div>
            </section>
          )}

          {tab === "content" && (
            <section className="ice-section">
              <SiteEditor
                identity={identity}
                siteId={siteId}
                linked={linked}
                onUpdated={() => {
                  load();
                }}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
