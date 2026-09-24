import React, { useState, useEffect } from "react";
import ModerationQueue from "./ModerationQueue";
import BanControls from "./BanControls";
import SiteStats from "./SiteStats";
import LimitControls from "./LimitControls";
import MasterEconomyControls from "./MasterEconomyControls";
import MasterUserSearch from "./MasterUserSearch";
import MasterHostingControls from "./MasterHostingControls";
import MasterSiteTransfer from "./MasterSiteTransfer";
import MasterSiteResets from "./MasterSiteResets";
import CycleBalance from "./CycleBalance";
import MasterLiteActivate from "./MasterLiteActivate";
import MasterReferralTracker from "./MasterReferralTracker";

import { unwrapOpt } from "./candidUtils";
import { CATEGORIES, categoryStyle } from "./categories";
import { createFactoryActor } from "./actors";
import SitePhotos from "./SitePhotos";

const MASTER_TABS = [
  { id: "overview", label: "Overview" },
  { id: "invites", label: "Invites" },
  { id: "users", label: "Users" },
  { id: "economy", label: "Economy" },
  { id: "hosting", label: "Hosting" },
  { id: "moderation", label: "Moderation" },
  { id: "balances", label: "Balances" },
  { id: "resets", label: "Resets" },
];

function icpToE8s(icp) {
  const s = String(icp ?? "").trim();
  if (!s) return 0n;
  const parts = s.split(".");
  const whole = BigInt(parts[0] || "0");
  let frac = (parts[1] || "").replace(/\D/g, "").slice(0, 8);
  while (frac.length < 8) frac += "0";
  return whole * 100_000_000n + BigInt(frac || "0");
}

function e8sToIcpLabel(e8s) {
  const n = typeof e8s === "bigint" ? Number(e8s) : Number(e8s);
  if (!Number.isFinite(n)) return "0";
  const icp = n / 100_000_000;
  if (Number.isInteger(icp)) return String(icp);
  return icp.toFixed(4).replace(/\.?0+$/, "");
}

function shortPrincipal(text) {
  if (!text || text.length < 16) return text || "";
  return `${text.slice(0, 8)}…${text.slice(-6)}`;
}

export default function Profile({ actor, identity }) {
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [isMaster, setIsMaster] = useState(false);
  const [cloaked, setCloaked] = useState(false);
  const [ownerPrincipal, setOwnerPrincipal] = useState(null);
  const [claiming, setClaiming] = useState(false);

  const [allCategories, setAllCategories] = useState(CATEGORIES);
  const [followedCats, setFollowedCats] = useState([]);
  const [savingCats, setSavingCats] = useState(false);
  const [catsMsg, setCatsMsg] = useState("");
  const [catsErr, setCatsErr] = useState("");
  const [mySiteCanisterId, setMySiteCanisterId] = useState("");

  const [grantTo, setGrantTo] = useState("");
  const [grantAmount, setGrantAmount] = useState("0.01");
  const [removeTo, setRemoveTo] = useState("");
  const [removeAmount, setRemoveAmount] = useState("0.01");
  const [hidePostId, setHidePostId] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminMsg, setAdminMsg] = useState("");
  const [adminErr, setAdminErr] = useState("");
  const [masterTab, setMasterTab] = useState("overview");
  const [copied, setCopied] = useState("");

  const principal = identity ? identity.getPrincipal() : null;
  const principalText = principal ? principal.toText() : "";
  const monogram = (username || "M").trim().slice(0, 1).toUpperCase() || "M";

  const copyText = async (text, key) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1800);
    } catch {
      /* ignore */
    }
  };

  const load = async () => {
    if (!actor || !principal) return;

    setLoading(true);
    setError("");
    try {
      const [profileResult, ownerFlag, owner, cloakFlag] = await Promise.all([
        actor.getProfile(principal),
        actor.isOwner(principal),
        actor.getOwner(),
        actor.isCloaked(),
      ]);

      const profile = unwrapOpt(profileResult);
      if (profile) {
        setUsername(profile.username || "");
        setBio(profile.bio || "");
      }

      setIsMaster(!!ownerFlag);
      setOwnerPrincipal(owner);
      setCloaked(!!cloakFlag);

      try {
        if (actor.getCategories) {
          const list = await actor.getCategories();
          if (Array.isArray(list) && list.length) setAllCategories(list);
        }
      } catch (_) {
        /* keep defaults */
      }
      try {
        if (actor.getFollowedCategories) {
          const list = await actor.getFollowedCategories(principal);
          setFollowedCats(Array.isArray(list) ? list : []);
        }
      } catch (_) {
        setFollowedCats([]);
      }

      try {
        const factory = await createFactoryActor(identity);
        const opt = await factory.getUserCanister(principal);
        const id = Array.isArray(opt) ? opt[0] : opt;
        setMySiteCanisterId(id ? (id.toText ? id.toText() : String(id)) : "");
      } catch (_) {
        setMySiteCanisterId("");
      }
    } catch (err) {
      console.error(err);
      setError("Could not load profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [actor, principal]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!actor) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const name = username.trim();
      if (!name) {
        setError("Username cannot be empty.");
        setSaving(false);
        return;
      }
      if (name.length > 50) {
        setError("Username must be 50 characters or less.");
        setSaving(false);
        return;
      }
      // avatarURL intentionally cleared / unused
      const result = await actor.setProfile(name, bio.trim(), "");
      const text = typeof result === "string" ? result : "Profile saved";
      if (/saved/i.test(text) || /success/i.test(text)) {
        setMessage(text);
      } else {
        setError(text || "Could not save profile.");
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const toggleFollowedCat = (cat) => {
    setFollowedCats((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
    setCatsMsg("");
    setCatsErr("");
  };

  const handleSaveCategories = async () => {
    if (!actor || !actor.setFollowedCategories) {
      setCatsErr("Categories not available yet — wait for deploy.");
      return;
    }
    setSavingCats(true);
    setCatsMsg("");
    setCatsErr("");
    try {
      const result = await actor.setFollowedCategories(followedCats);
      const text = typeof result === "string" ? result : "Saved";
      if (/saved/i.test(text)) {
        setCatsMsg(text);
      } else {
        setCatsErr(text || "Could not save.");
      }
    } catch (err) {
      console.error(err);
      setCatsErr(err?.message || "Failed to save categories.");
    } finally {
      setSavingCats(false);
    }
  };

  const handleClaimMaster = async () => {
    if (!actor) return;
    setClaiming(true);
    setMessage("");
    setError("");

    try {
      const result = await actor.claimMasterProfile();
      const text = typeof result === "string" ? result : "Claimed.";
      if (/success/i.test(text) || /already own/i.test(text)) {
        setMessage(text);
      } else {
        setError(text);
      }
      await load();
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not claim master profile.");
    } finally {
      setClaiming(false);
    }
  };

  const handleToggleCloak = async () => {
    if (!actor) return;
    setAdminBusy(true);
    setAdminMsg("");
    setAdminErr("");

    try {
      const next = !cloaked;
      const ok = await actor.setCloak(next);
      if (ok) {
        setCloaked(next);
        setAdminMsg(
          next
            ? "Cloaked. Your Founder badge is hidden from everyone else."
            : "Uncloaked. Founder badge is visible again."
        );
      } else {
        setAdminErr("Could not change cloak setting.");
      }
    } catch (err) {
      console.error(err);
      setAdminErr("Cloak toggle failed.");
    } finally {
      setAdminBusy(false);
    }
  };

  const handleCreditIcp = async (e) => {
    e.preventDefault();
    if (!actor || !grantTo.trim()) return;

    setAdminBusy(true);
    setAdminMsg("");
    setAdminErr("");

    try {
      const { Principal } = await import("@dfinity/principal");
      const to = Principal.fromText(grantTo.trim());
      const amountE8s = icpToE8s(grantAmount);
      if (amountE8s <= 0n) {
        setAdminErr("Enter an ICP amount greater than 0.");
        return;
      }
      if (!actor.adminCreditIcpE8s) {
        setAdminErr("adminCreditIcpE8s not available — redeploy ICE.");
        return;
      }
      const result = await actor.adminCreditIcpE8s(to, amountE8s);
      const text = typeof result === "string" ? result : "";
      if (/^Credited/i.test(text)) {
        setAdminMsg(`Credited ${e8sToIcpLabel(amountE8s)} ICP prepaid. ${text}`);
        setGrantTo("");
      } else {
        setAdminErr(text || "Credit failed. Are you the owner?");
      }
    } catch (err) {
      console.error(err);
      setAdminErr("Invalid principal or request failed.");
    } finally {
      setAdminBusy(false);
    }
  };

  const handleDebitIcp = async (e) => {
    e.preventDefault();
    if (!actor || !removeTo.trim()) return;

    setAdminBusy(true);
    setAdminMsg("");
    setAdminErr("");

    try {
      const { Principal } = await import("@dfinity/principal");
      const from = Principal.fromText(removeTo.trim());
      const amountE8s = icpToE8s(removeAmount);
      if (amountE8s <= 0n) {
        setAdminErr("Enter an ICP amount greater than 0.");
        return;
      }
      if (!actor.adminDebitIcpE8s) {
        setAdminErr("adminDebitIcpE8s not available — redeploy ICE.");
        return;
      }
      const result = await actor.adminDebitIcpE8s(from, amountE8s);
      const text = typeof result === "string" ? result : "";
      if (/^Removed/i.test(text)) {
        setAdminMsg(text.replace(/(\d+) e8s/g, (_, n) => `${e8sToIcpLabel(n)} ICP`));
      } else {
        setAdminErr(text || "Debit failed.");
      }
    } catch (err) {
      console.error(err);
      setAdminErr("Invalid principal or request failed.");
    } finally {
      setAdminBusy(false);
    }
  };

  const handleClearIcp = async () => {
    if (!actor || !removeTo.trim()) return;
    if (!window.confirm("Clear this user’s prepaid ICP balance to 0?")) return;

    setAdminBusy(true);
    setAdminMsg("");
    setAdminErr("");

    try {
      const { Principal } = await import("@dfinity/principal");
      const from = Principal.fromText(removeTo.trim());
      if (!actor.adminClearIcpE8s) {
        setAdminErr("adminClearIcpE8s not available — redeploy ICE.");
        return;
      }
      const result = await actor.adminClearIcpE8s(from);
      const text = typeof result === "string" ? result : "";
      if (/^Cleared/i.test(text)) {
        setAdminMsg(text.replace(/(\d+) e8s/g, (_, n) => `${e8sToIcpLabel(n)} ICP`));
      } else {
        setAdminErr(text || "Clear failed.");
      }
    } catch (err) {
      console.error(err);
      setAdminErr("Invalid principal or request failed.");
    } finally {
      setAdminBusy(false);
    }
  };

  const handleHidePost = async (e) => {
    e.preventDefault();
    if (!actor || hidePostId === "") return;

    setAdminBusy(true);
    setAdminMsg("");
    setAdminErr("");

    try {
      const id = Number(hidePostId);
      const ok = await actor.adminHidePost(id);

      if (ok) {
        setAdminMsg(`Post #${id} is now hidden.`);
        setHidePostId("");
      } else {
        setAdminErr("Hide failed. Check the post ID or ownership.");
      }
    } catch (err) {
      console.error(err);
      setAdminErr("Could not hide post.");
    } finally {
      setAdminBusy(false);
    }
  };

  const ownerIsAnonymous =
    !ownerPrincipal ||
    ownerPrincipal.toString() === "aaaaa-aa" ||
    (typeof ownerPrincipal.isAnonymous === "function" && ownerPrincipal.isAnonymous());

  if (loading) {
    return <div className="ice-loading">Loading profile…</div>;
  }

  return (
    <div className={`ice-profile${isMaster ? " ice-profile--master" : ""}`}>
      {/* ── Hero ── */}
      <header className={`ice-profile-hero${isMaster ? " ice-profile-hero--master" : ""}`}>
        <div className="ice-profile-hero-main">
          <div className={`ice-profile-avatar${isMaster ? " ice-profile-avatar--master" : ""}`} aria-hidden>
            {monogram}
          </div>
          <div className="ice-profile-hero-text">
            <div className="ice-profile-title-row">
              <h2 className="ice-profile-title">
                {isMaster ? "Master profile" : "Your profile"}
              </h2>
              {isMaster && !cloaked && (
                <span className="ice-profile-badge ice-profile-badge--founder">Founder</span>
              )}
              {isMaster && cloaked && (
                <span className="ice-profile-badge ice-profile-badge--cloaked">Cloaked</span>
              )}
            </div>
            <p className="ice-profile-subtitle">
              {isMaster
                ? "Network owner · identity, visibility, and admin tools"
                : "Username, bio, and feed preferences"}
            </p>
            {principalText && (
              <div className="ice-profile-id-row">
                <span className="ice-profile-id-label">Internet Identity</span>
                <code className="ice-profile-id" title={principalText}>
                  {shortPrincipal(principalText)}
                </code>
                <button
                  type="button"
                  className="ice-btn ice-btn-xs"
                  onClick={() => copyText(principalText, "ii")}
                >
                  {copied === "ii" ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
        </div>

        {isMaster && (
          <div className="ice-profile-hero-actions">
            <div className="ice-profile-cloak-card">
              <div>
                <div className="ice-profile-cloak-title">Public badge</div>
                <div className="ice-profile-cloak-desc">
                  {cloaked
                    ? "Hidden — you appear as a normal member"
                    : "Visible — Founder shows on posts & profile"}
                </div>
              </div>
              <button
                type="button"
                className={`ice-btn${cloaked ? "" : " ice-btn-warn"}`}
                onClick={handleToggleCloak}
                disabled={adminBusy}
              >
                {adminBusy ? "…" : cloaked ? "Uncloak" : "Cloak"}
              </button>
            </div>
          </div>
        )}
      </header>

      {mySiteCanisterId && (
        <div className="ice-profile-site-card">
          <div className="ice-profile-site-meta">
            <span className="ice-section-title" style={{ margin: 0 }}>
              Linked site canister
            </span>
            <code className="ice-mono ice-profile-site-id">{mySiteCanisterId}</code>
          </div>
          <button
            type="button"
            className="ice-btn ice-btn-xs"
            onClick={() => copyText(mySiteCanisterId, "site")}
          >
            {copied === "site" ? "Copied" : "Copy ID"}
          </button>
        </div>
      )}

      {ownerIsAnonymous && !isMaster && (
        <div className="ice-profile-claim">
          <p>
            No master profile yet. Claim it with this Internet Identity to become the Founder.
          </p>
          <button
            type="button"
            className="ice-btn-primary"
            onClick={handleClaimMaster}
            disabled={claiming}
          >
            {claiming ? "Claiming…" : "Claim master profile"}
          </button>
          {message && <p className="ice-alert-ok">{message}</p>}
          {error && <p className="ice-alert-error" style={{ marginTop: "0.75rem" }}>{error}</p>}
        </div>
      )}

      <div className={`ice-profile-grid${isMaster ? " ice-profile-grid--master" : ""}`}>
        {/* ── Identity ── */}
        <section className="ice-profile-card">
          <div className="ice-profile-card-head">
            <h3>Identity</h3>
            <p>Public username and short bio shown across ICE.</p>
          </div>
          <form onSubmit={handleSave} className="ice-profile-form">
            <div className="ice-field">
              <label htmlFor="prof-username">Username</label>
              <input
                id="prof-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                maxLength={50}
              />
            </div>
            <div className="ice-field">
              <label htmlFor="prof-bio">Bio</label>
              <textarea
                id="prof-bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="A short bio…"
                rows={3}
                maxLength={300}
              />
              <span className="ice-field-hint">{bio.length}/300</span>
            </div>
            <div className="ice-profile-form-actions">
              <button type="submit" className="ice-btn-primary" disabled={saving}>
                {saving ? "Saving…" : "Save profile"}
              </button>
              {message && <span className="ice-inline-ok">{message}</span>}
              {error && <span className="ice-inline-err">{error}</span>}
            </div>
          </form>
        </section>

        {/* ── Preferences ── */}
        <section className="ice-profile-card">
          <div className="ice-profile-card-head">
            <h3>Preferences</h3>
            <p>Feed topics and social lists.</p>
          </div>

          <div className="ice-profile-pref-block">
            <div className="ice-profile-pref-label">Associates</div>
            <p className="ice-profile-pref-desc">
              Following, followers, and blocked accounts live under{" "}
              <strong>Associates</strong> in the top bar.
            </p>
          </div>

          <div className="ice-profile-pref-block">
            <div className="ice-profile-pref-label">Followed categories</div>
            <p className="ice-profile-pref-desc">
              Used by the feed’s <strong>Following</strong> filter. Default still shows all posts.
            </p>
            <div className="ice-profile-cat-row">
              {allCategories.map((cat) => {
                const on = followedCats.includes(cat);
                const s = categoryStyle(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    className={`ice-cat-chip${on ? " is-on" : ""}`}
                    onClick={() => toggleFollowedCat(cat)}
                    style={
                      on
                        ? {
                            borderColor: s.border,
                            background: s.bg,
                            color: s.color,
                          }
                        : undefined
                    }
                  >
                    {on ? "✓ " : ""}
                    {cat}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className="ice-btn-primary"
              onClick={handleSaveCategories}
              disabled={savingCats}
            >
              {savingCats ? "Saving…" : "Save categories"}
            </button>
            {catsMsg && <p className="ice-inline-ok">{catsMsg}</p>}
            {catsErr && <p className="ice-inline-err">{catsErr}</p>}
          </div>
        </section>

        {/* ── Photos (user canister storage; ICE keeps links only) ── */}
        <SitePhotos identity={identity} siteCanisterId={mySiteCanisterId} />
      </div>

      {/* ── Master control center ── */}
      {isMaster && (
        <section className="ice-master-console">
          <div className="ice-master-console-head">
            <div>
              <div className="ice-master-kicker">Control center</div>
              <h3 className="ice-master-console-title">Master tools</h3>
              <p className="ice-master-console-desc">
                Only visible to the network owner. Organize users, economy, hosting, and moderation.
              </p>
            </div>
          </div>

          {/* Separate from ICE Network tabs — Lite.frostedblocks.com only */}
          <MasterLiteActivate actor={actor} identity={identity} />

          <nav className="ice-tabs ice-master-tabs" aria-label="Master tools">
            {MASTER_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`ice-tab${masterTab === t.id ? " is-active" : ""}`}
                onClick={() => setMasterTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="ice-master-console-body">
            {masterTab === "overview" && (
              <div className="ice-master-pane">
                <SiteStats actor={actor} />
                <div className="ice-master-pane-split">
                  <CycleBalance actor={actor} identity={identity} />
                  <div className="ice-profile-card ice-profile-card--nested">
                    <div className="ice-profile-card-head">
                      <h3>Visibility</h3>
                      <p>Founder badge on public surfaces.</p>
                    </div>
                    <div className="ice-profile-cloak-card ice-profile-cloak-card--inline">
                      <div>
                        <div className="ice-profile-cloak-title">
                          {cloaked ? "Currently cloaked" : "Currently public"}
                        </div>
                        <div className="ice-profile-cloak-desc">
                          {cloaked
                            ? "Admin powers still work while cloaked."
                            : "Founder badge is visible on your posts and profile."}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={`ice-btn${cloaked ? "" : " ice-btn-warn"}`}
                        onClick={handleToggleCloak}
                        disabled={adminBusy}
                      >
                        {adminBusy ? "…" : cloaked ? "Uncloak" : "Cloak"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {masterTab === "invites" && (
              <div className="ice-master-pane">
                <MasterReferralTracker actor={actor} />
              </div>
            )}

            {masterTab === "users" && (
              <div className="ice-master-pane">
                <MasterUserSearch
                  actor={actor}
                  identity={identity}
                  onUsePrincipal={(pt) => {
                    setGrantTo(pt);
                    setRemoveTo(pt);
                    setMasterTab("balances");
                  }}
                />
              </div>
            )}

            {masterTab === "economy" && (
              <div className="ice-master-pane">
                <MasterEconomyControls actor={actor} />
                <LimitControls actor={actor} />
              </div>
            )}

            {masterTab === "hosting" && (
              <div className="ice-master-pane">
                <MasterHostingControls identity={identity} />
                <MasterSiteTransfer identity={identity} />
              </div>
            )}

            {masterTab === "moderation" && (
              <div className="ice-master-pane">
                <ModerationQueue actor={actor} />
                <BanControls actor={actor} />
                <form onSubmit={handleHidePost} className="ice-profile-card ice-profile-card--nested">
                  <div className="ice-profile-card-head">
                    <h3>Hide post by ID</h3>
                    <p>Manual hide when the moderation queue is not enough.</p>
                  </div>
                  <div className="ice-inline-fields">
                    <input
                      type="number"
                      min="0"
                      value={hidePostId}
                      onChange={(e) => setHidePostId(e.target.value)}
                      placeholder="Post ID"
                      className="ice-input-sm"
                    />
                    <button
                      type="submit"
                      className="ice-btn ice-btn-danger"
                      disabled={adminBusy || hidePostId === ""}
                    >
                      {adminBusy ? "Working…" : "Hide post"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {masterTab === "resets" && (
              <div className="ice-master-pane">
                <MasterSiteResets identity={identity} />
              </div>
            )}

            {masterTab === "balances" && (
              <div className="ice-master-pane">
                <form
                  onSubmit={handleCreditIcp}
                  className="ice-profile-card ice-profile-card--nested"
                >
                  <div className="ice-profile-card-head">
                    <h3>Credit prepaid ICP</h3>
                    <p>
                      Ops / recovery credit to a member’s prepaid balance (used for action fees). Does
                      not move ledger ICP.
                    </p>
                  </div>
                  <div className="ice-field">
                    <label>Principal</label>
                    <input
                      type="text"
                      value={grantTo}
                      onChange={(e) => setGrantTo(e.target.value)}
                      placeholder="User principal ID"
                    />
                  </div>
                  <div className="ice-inline-fields">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={grantAmount}
                      onChange={(e) => setGrantAmount(e.target.value)}
                      className="ice-input-sm"
                      placeholder="0.01"
                      aria-label="ICP amount to credit"
                    />
                    <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>ICP</span>
                    <button
                      type="submit"
                      className="ice-btn-primary"
                      disabled={adminBusy || !grantTo.trim()}
                    >
                      {adminBusy ? "Working…" : "Credit ICP"}
                    </button>
                  </div>
                </form>

                <form
                  onSubmit={handleDebitIcp}
                  className="ice-profile-card ice-profile-card--nested"
                >
                  <div className="ice-profile-card-head">
                    <h3>Debit prepaid ICP</h3>
                    <p>Corrections only. Never goes below zero. Does not refund to their II.</p>
                  </div>
                  <div className="ice-field">
                    <label>Principal</label>
                    <input
                      type="text"
                      value={removeTo}
                      onChange={(e) => setRemoveTo(e.target.value)}
                      placeholder="User principal ID"
                    />
                  </div>
                  <div className="ice-inline-fields">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={removeAmount}
                      onChange={(e) => setRemoveAmount(e.target.value)}
                      className="ice-input-sm"
                      placeholder="0.01"
                      aria-label="ICP amount to debit"
                    />
                    <span style={{ color: "#94a3b8", fontSize: "0.85rem" }}>ICP</span>
                    <button
                      type="submit"
                      className="ice-btn ice-btn-danger"
                      disabled={adminBusy || !removeTo.trim()}
                    >
                      {adminBusy ? "Working…" : "Debit"}
                    </button>
                    <button
                      type="button"
                      className="ice-btn ice-btn-danger-strong"
                      disabled={adminBusy || !removeTo.trim()}
                      onClick={handleClearIcp}
                    >
                      {adminBusy ? "…" : "Clear to 0"}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {(adminMsg || adminErr) && (
              <div className="ice-master-feedback">
                {adminMsg && <p className="ice-inline-ok">{adminMsg}</p>}
                {adminErr && <p className="ice-inline-err">{adminErr}</p>}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
