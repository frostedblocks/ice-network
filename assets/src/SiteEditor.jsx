import React, { useState, useEffect, useCallback } from "react";
import { createUserSiteActor, createFactoryActor } from "./actors";

const EDITOR_TABS = [
  { id: "profile", label: "Profile" },
  { id: "pages", label: "Pages" },
  { id: "settings", label: "Settings" },
  { id: "features", label: "Features" },
  { id: "posts", label: "Posts" },
];

const DEFAULT_FEATURES = [
  { key: "localFeed", label: "Local feed", hint: "Show posts on this canister" },
  { key: "p2pFollow", label: "P2P follow", hint: "Follow other site canisters (when linked)" },
  { key: "publicProfile", label: "Public profile", hint: "Allow public profile visibility" },
];

const DEFAULT_SETTINGS = [
  { key: "displayName", label: "Display name" },
  { key: "theme", label: "Theme" },
];

function pairKey(entry) {
  if (Array.isArray(entry)) return entry[0];
  if (entry && typeof entry === "object") return entry[0] ?? entry._0_;
  return null;
}

function pairVal(entry) {
  if (Array.isArray(entry)) return entry[1];
  if (entry && typeof entry === "object") return entry[1] ?? entry._1_;
  return null;
}

function slugify(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

/**
 * Full site editor — profile, pages, settings, features, local posts.
 * Uses user_site canister APIs.
 */
export default function SiteEditor({ identity, siteId, linked = true, onUpdated }) {
  const [sub, setSub] = useState("profile");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [networkLinked, setNetworkLinked] = useState(!!linked);
  const [resetStatus, setResetStatus] = useState(null);
  const [resetConfirm, setResetConfirm] = useState("");

  // Profile
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");

  // Pages
  const [pages, setPages] = useState([]);
  const [pageId, setPageId] = useState("profile");
  const [pageTitle, setPageTitle] = useState("");
  const [pageBody, setPageBody] = useState("");
  const [newPageId, setNewPageId] = useState("");
  const [newPageTitle, setNewPageTitle] = useState("");

  // Settings
  const [settings, setSettings] = useState({});
  const [settingDrafts, setSettingDrafts] = useState({});
  const [newSettingKey, setNewSettingKey] = useState("");
  const [newSettingVal, setNewSettingVal] = useState("");

  // Features
  const [features, setFeatures] = useState({});
  const [newFeatureKey, setNewFeatureKey] = useState("");

  // Posts
  const [posts, setPosts] = useState([]);
  const [draft, setDraft] = useState("");

  const flash = (ok, err) => {
    setMsg(ok || "");
    setError(err || "");
  };

  const load = useCallback(async () => {
    if (!identity || !siteId) return;
    setLoading(true);
    setError("");
    try {
      const site = await createUserSiteActor(identity, siteId);

      const [prof, pageList, settingPairs, featurePairs, feed, linkedFlag] = await Promise.all([
        site.getProfile().catch(() => null),
        site.listPages().catch(() => []),
        site.listSettings ? site.listSettings().catch(() => []) : Promise.resolve([]),
        site.listFeatures ? site.listFeatures().catch(() => []) : Promise.resolve([]),
        site.getLocalFeed(40).catch(() => []),
        site.isLinkedToNetwork ? site.isLinkedToNetwork().catch(() => linked) : Promise.resolve(linked),
      ]);
      setNetworkLinked(typeof linkedFlag === "boolean" ? linkedFlag : !!linked);
      try {
        const factory = await createFactoryActor(identity);
        if (factory.getUserResetStatus) {
          setResetStatus(await factory.getUserResetStatus());
        }
      } catch (_) {
        setResetStatus(null);
      }

      if (prof) {
        setUsername(prof.username || "");
        setBio(prof.bio || "");

      }

      const plist = Array.isArray(pageList) ? pageList : [];
      setPages(plist);
      setPageId((currentId) => {
        const selected =
          plist.find((p) => p.id === currentId) ||
          plist.find((p) => p.id === "profile") ||
          plist[0];
        if (selected) {
          setPageTitle(selected.title || "");
          setPageBody(selected.body || "");
          return selected.id;
        }
        return currentId;
      });

      const smap = {};
      for (const e of settingPairs || []) {
        const k = pairKey(e);
        const v = pairVal(e);
        if (k != null) smap[String(k)] = v == null ? "" : String(v);
      }
      setSettings(smap);
      setSettingDrafts(smap);

      const fmap = {};
      for (const e of featurePairs || []) {
        const k = pairKey(e);
        const v = pairVal(e);
        if (k != null) fmap[String(k)] = !!v;
      }
      for (const f of DEFAULT_FEATURES) {
        if (fmap[f.key] === undefined) fmap[f.key] = false;
      }
      setFeatures(fmap);

      setPosts(Array.isArray(feed) ? feed : []);
    } catch (e) {
      console.error(e);
      setError(
        e?.message ||
          "Could not load site data. If this site is old, use Domain & DNS → Upgrade site software."
      );
    } finally {
      setLoading(false);
    }
  }, [identity, siteId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectPage = (id) => {
    const p = pages.find((x) => x.id === id);
    setPageId(id);
    if (p) {
      setPageTitle(p.title || "");
      setPageBody(p.body || "");
    } else {
      setPageTitle("");
      setPageBody("");
    }
  };

  const saveProfile = async (e) => {
    e?.preventDefault?.();
    if (!identity || !siteId) return;
    const name = username.trim();
    if (!name) {
      flash("", "Username is required.");
      return;
    }
    setBusy(true);
    flash("", "");
    try {
      const site = await createUserSiteActor(identity, siteId);
      const result = await site.setProfile(name, bio.trim(), "");
      const text = typeof result === "string" ? result : "";
      if (/Only owner/i.test(text)) {
        flash("", text);
      } else {
        flash(text || "Profile saved.", "");
        await load();
        onUpdated?.();
      }
    } catch (err) {
      console.error(err);
      flash("", err?.message || "Save profile failed");
    } finally {
      setBusy(false);
    }
  };

  const savePage = async (e) => {
    e?.preventDefault?.();
    if (!identity || !siteId) return;
    const id = (pageId || "").trim();
    if (!id) {
      flash("", "Page id required.");
      return;
    }
    setBusy(true);
    flash("", "");
    try {
      const site = await createUserSiteActor(identity, siteId);
      const result = await site.upsertPage(id, pageTitle.trim() || id, pageBody);
      const text = typeof result === "string" ? result : "";
      if (/Only owner|required/i.test(text) && !/^Page saved/i.test(text)) {
        flash("", text);
      } else {
        flash(text || "Page saved.", "");
        await load();
        onUpdated?.();
      }
    } catch (err) {
      console.error(err);
      flash("", err?.message || "Save page failed");
    } finally {
      setBusy(false);
    }
  };

  const createPage = async (e) => {
    e?.preventDefault?.();
    if (!identity || !siteId) return;
    let id = slugify(newPageId || newPageTitle);
    if (!id) {
      flash("", "Enter a page id or title.");
      return;
    }
    if (id === "profile") {
      flash("", "Use the existing profile page — pick it from the list.");
      return;
    }
    setBusy(true);
    flash("", "");
    try {
      const site = await createUserSiteActor(identity, siteId);
      const title = newPageTitle.trim() || id;
      const result = await site.upsertPage(id, title, "");
      const text = typeof result === "string" ? result : "";
      if (/Only owner/i.test(text)) {
        flash("", text);
      } else {
        setNewPageId("");
        setNewPageTitle("");
        setPageId(id);
        setPageTitle(title);
        setPageBody("");
        flash(text || `Page “${id}” created.`, "");
        await load();
        onUpdated?.();
      }
    } catch (err) {
      console.error(err);
      flash("", err?.message || "Create page failed");
    } finally {
      setBusy(false);
    }
  };

  const removePage = async () => {
    if (!identity || !siteId || !pageId) return;
    if (pageId === "profile") {
      flash("", "Cannot delete the default profile page.");
      return;
    }
    if (!window.confirm(`Delete page “${pageId}”? This cannot be undone.`)) return;
    setBusy(true);
    flash("", "");
    try {
      const site = await createUserSiteActor(identity, siteId);
      const result = await site.deletePage(pageId);
      const text = typeof result === "string" ? result : "";
      if (/Cannot|Only owner/i.test(text)) {
        flash("", text);
      } else {
        flash(text || "Page deleted.", "");
        setPageId("profile");
        await load();
        onUpdated?.();
      }
    } catch (err) {
      console.error(err);
      flash("", err?.message || "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const saveSetting = async (key) => {
    if (!identity || !siteId || !key) return;
    const value = settingDrafts[key] ?? "";
    setBusy(true);
    flash("", "");
    try {
      const site = await createUserSiteActor(identity, siteId);
      const result = await site.setSetting(key, value);
      const text = typeof result === "string" ? result : "";
      if (/Only owner/i.test(text)) {
        flash("", text);
      } else {
        flash(`Setting “${key}” saved.`, "");
        await load();
        onUpdated?.();
      }
    } catch (err) {
      console.error(err);
      flash("", err?.message || "Save setting failed");
    } finally {
      setBusy(false);
    }
  };

  const addSetting = async (e) => {
    e?.preventDefault?.();
    const key = slugify(newSettingKey).replace(/-/g, "") || newSettingKey.trim();
    if (!key) {
      flash("", "Setting key required.");
      return;
    }
    setBusy(true);
    flash("", "");
    try {
      const site = await createUserSiteActor(identity, siteId);
      await site.setSetting(key, newSettingVal);
      setNewSettingKey("");
      setNewSettingVal("");
      flash(`Setting “${key}” added.`, "");
      await load();
      onUpdated?.();
    } catch (err) {
      console.error(err);
      flash("", err?.message || "Add setting failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleFeature = async (key, enabled) => {
    if (!identity || !siteId) return;
    setBusy(true);
    flash("", "");
    try {
      const site = await createUserSiteActor(identity, siteId);
      const result = await site.setFeature(key, enabled);
      const text = typeof result === "string" ? result : "";
      if (/Only owner/i.test(text)) {
        flash("", text);
      } else {
        setFeatures((prev) => ({ ...prev, [key]: enabled }));
        flash(`Feature “${key}” ${enabled ? "on" : "off"}.`, "");
        onUpdated?.();
      }
    } catch (err) {
      console.error(err);
      flash("", err?.message || "Update feature failed");
    } finally {
      setBusy(false);
    }
  };

  const addFeature = async (e) => {
    e?.preventDefault?.();
    const key = slugify(newFeatureKey).replace(/-/g, "") || newFeatureKey.trim();
    if (!key) {
      flash("", "Feature key required.");
      return;
    }
    setBusy(true);
    flash("", "");
    try {
      const site = await createUserSiteActor(identity, siteId);
      await site.setFeature(key, true);
      setNewFeatureKey("");
      flash(`Feature “${key}” added (on).`, "");
      await load();
      onUpdated?.();
    } catch (err) {
      console.error(err);
      flash("", err?.message || "Add feature failed");
    } finally {
      setBusy(false);
    }
  };

  const publishPost = async (e) => {
    e?.preventDefault?.();
    if (!identity || !siteId || !draft.trim()) return;
    setBusy(true);
    flash("", "");
    try {
      const site = await createUserSiteActor(identity, siteId);
      const result = await site.makeLocalPost(draft.trim(), []);
      const id = Array.isArray(result) ? result[0] : result;
      if (id === null || id === undefined) {
        flash("", "Post failed — are you the site owner?");
      } else {
        setDraft("");
        flash("Posted to your canister.", "");
        await load();
        onUpdated?.();
      }
    } catch (err) {
      console.error(err);
      flash("", err?.message || "Post failed");
    } finally {
      setBusy(false);
    }
  };

  if (!siteId) return null;

  if (loading) {
    return <div className="ice-loading">Loading site editor…</div>;
  }

  const settingKeys = Array.from(
    new Set([...DEFAULT_SETTINGS.map((s) => s.key), ...Object.keys(settings)])
  );
  const featureKeys = Array.from(
    new Set([...DEFAULT_FEATURES.map((f) => f.key), ...Object.keys(features)])
  );

  return (
    <div>
      <div className="ice-glass" style={{ padding: "1.15rem 1.25rem", marginBottom: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div className="ice-section-title" style={{ marginBottom: "0.25rem" }}>
              Site editor
            </div>
            <p style={{ margin: 0, fontSize: "0.85rem", color: "#94a3b8", lineHeight: 1.5 }}>
              Edit profile, pages, settings, and features stored on this canister. Changes save
              on-chain and appear on your public site link (Overview → View public site). Turn off{" "}
              <strong style={{ color: "#e2e8f0" }}>publicProfile</strong> under Features to hide the
              public view.
            </p>
          </div>
          <button type="button" className="ice-btn" disabled={busy} onClick={load}>
            Reload
          </button>
        </div>

        {msg && (
          <p className="ice-alert-ok" style={{ margin: "0.75rem 0 0" }}>
            {msg}
          </p>
        )}
        {error && (
          <div className="ice-alert-error" style={{ marginTop: "0.75rem", marginBottom: 0 }}>
            {error}
          </div>
        )}

        <nav className="ice-tabs" style={{ marginTop: "1rem", marginBottom: 0 }} aria-label="Editor sections">
          {EDITOR_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`ice-tab${sub === t.id ? " is-active" : ""}`}
              onClick={() => {
                setSub(t.id);
                flash("", "");
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* PROFILE */}
      {sub === "profile" && (
        <form className="ice-glass" style={{ padding: "1.15rem 1.25rem" }} onSubmit={saveProfile}>
          <div className="ice-section-title">Site profile</div>
          <p style={{ margin: "0 0 0.85rem", fontSize: "0.8rem", color: "#94a3b8" }}>
            Stored on your personal site canister (separate from your ICE network profile).
          </p>
          <label style={labelStyle}>Username / display name</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={50}
            disabled={busy}
            style={inputStyle}
            placeholder="Your name on this site"
          />
          <label style={{ ...labelStyle, marginTop: "0.75rem" }}>Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={busy}
            style={{ ...inputStyle, resize: "vertical" }}
            placeholder="Short description of this site"
          />
          <button type="submit" className="ice-btn-primary" disabled={busy} style={{ marginTop: "1rem" }}>
            {busy ? "Saving…" : "Save profile"}
          </button>
        </form>
      )}

      {/* PAGES */}
      {sub === "pages" && (
        <div>
          <div className="ice-glass" style={{ padding: "1.15rem 1.25rem", marginBottom: "0.85rem" }}>
            <div className="ice-section-title">Pages</div>
            <p style={{ margin: "0 0 0.75rem", fontSize: "0.8rem", color: "#94a3b8" }}>
              Create and edit pages on this canister. The <code style={{ color: "#cbd5e1" }}>profile</code> page
              is the default and cannot be deleted.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "1rem" }}>
              {pages.length === 0 ? (
                <span style={{ color: "#64748b", fontSize: "0.85rem" }}>No pages yet.</span>
              ) : (
                pages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`ice-nav-btn${pageId === p.id ? " is-active" : ""}`}
                    onClick={() => selectPage(p.id)}
                  >
                    {p.id}
                  </button>
                ))
              )}
            </div>

            <form onSubmit={savePage}>
              <label style={labelStyle}>Page id</label>
              <input
                type="text"
                value={pageId}
                onChange={(e) => setPageId(e.target.value)}
                disabled={busy || pageId === "profile"}
                style={inputStyle}
              />
              <label style={{ ...labelStyle, marginTop: "0.65rem" }}>Title</label>
              <input
                type="text"
                value={pageTitle}
                onChange={(e) => setPageTitle(e.target.value)}
                disabled={busy}
                style={inputStyle}
                placeholder="Page title"
              />
              <label style={{ ...labelStyle, marginTop: "0.65rem" }}>Body</label>
              <textarea
                value={pageBody}
                onChange={(e) => setPageBody(e.target.value)}
                rows={10}
                disabled={busy}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "ui-monospace, Menlo, monospace", fontSize: "0.85rem" }}
                placeholder="Page content (markdown or plain text)"
              />
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.85rem" }}>
                <button type="submit" className="ice-btn-primary" disabled={busy}>
                  {busy ? "Saving…" : "Save page"}
                </button>
                {pageId && pageId !== "profile" && (
                  <button type="button" className="ice-btn-danger" disabled={busy} onClick={removePage}>
                    Delete page
                  </button>
                )}
              </div>
            </form>
          </div>

          <form className="ice-glass-soft" style={{ padding: "1rem 1.15rem" }} onSubmit={createPage}>
            <div className="ice-section-title">New page</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "0.65rem",
              }}
            >
              <div>
                <label style={labelStyle}>Id (slug)</label>
                <input
                  type="text"
                  value={newPageId}
                  onChange={(e) => setNewPageId(e.target.value)}
                  placeholder="about"
                  disabled={busy}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Title</label>
                <input
                  type="text"
                  value={newPageTitle}
                  onChange={(e) => setNewPageTitle(e.target.value)}
                  placeholder="About"
                  disabled={busy}
                  style={inputStyle}
                />
              </div>
            </div>
            <button type="submit" className="ice-btn" disabled={busy} style={{ marginTop: "0.75rem" }}>
              Create page
            </button>
          </form>
        </div>
      )}

      {/* SETTINGS */}
      {sub === "settings" && (
        <div className="ice-glass" style={{ padding: "1.15rem 1.25rem" }}>
          <div className="ice-section-title">Settings</div>
          <p style={{ margin: "0 0 0.85rem", fontSize: "0.8rem", color: "#94a3b8" }}>
            Key/value text settings on this canister (theme, display name, custom keys).
          </p>

          {settingKeys.map((key) => {
            const meta = DEFAULT_SETTINGS.find((s) => s.key === key);
            return (
              <div key={key} style={{ marginBottom: "0.85rem" }}>
                <label style={labelStyle}>{meta?.label || key}</label>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    value={settingDrafts[key] ?? ""}
                    onChange={(e) =>
                      setSettingDrafts((prev) => ({ ...prev, [key]: e.target.value }))
                    }
                    disabled={busy}
                    style={{ ...inputStyle, flex: "1 1 200px" }}
                  />
                  <button
                    type="button"
                    className="ice-btn"
                    disabled={busy}
                    onClick={() => saveSetting(key)}
                  >
                    Save
                  </button>
                </div>
              </div>
            );
          })}

          <hr className="ice-hr" style={{ margin: "1.25rem 0" }} />
          <div className="ice-section-title">Add setting</div>
          <form onSubmit={addSetting} style={{ display: "grid", gap: "0.55rem" }}>
            <input
              type="text"
              value={newSettingKey}
              onChange={(e) => setNewSettingKey(e.target.value)}
              placeholder="key (e.g. tagline)"
              disabled={busy}
              style={inputStyle}
            />
            <input
              type="text"
              value={newSettingVal}
              onChange={(e) => setNewSettingVal(e.target.value)}
              placeholder="value"
              disabled={busy}
              style={inputStyle}
            />
            <button type="submit" className="ice-btn" disabled={busy} style={{ width: "fit-content" }}>
              Add setting
            </button>
          </form>

          {/* Factory reset — only while attached to ICE */}
          <hr className="ice-hr" style={{ margin: "1.5rem 0 1rem" }} />
          <div className="ice-section-title" style={{ color: "#f87171" }}>
            Danger zone
          </div>
          {networkLinked ? (
            <div
              className="ice-glass-soft"
              style={{
                padding: "0.9rem 1rem",
                border: "1px solid rgba(248, 113, 113, 0.28)",
              }}
            >
              <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "0.9rem" }}>
                Reset to factory state
              </div>
              <p style={{ margin: "0.35rem 0 0.75rem", fontSize: "0.8rem", color: "#94a3b8", lineHeight: 1.5 }}>
                Reinstalls the original ICE factory WASM and permanently wipes all posts, pages,
                settings, and custom data. Only the <strong style={{ color: "#e2e8f0" }}>linked owner II</strong> may
                run this, and at most <strong style={{ color: "#e2e8f0" }}>once every 24 hours</strong>. Controllers stay.
              </p>
              {resetStatus && (
                <p
                  style={{
                    margin: "0 0 0.65rem",
                    fontSize: "0.78rem",
                    color: resetStatus.allowed ? "#86efac" : "#fbbf24",
                    lineHeight: 1.4,
                  }}
                >
                  {resetStatus.message}
                  {!resetStatus.allowed &&
                    resetStatus.cooldownRemainingNs != null &&
                    Number(resetStatus.cooldownRemainingNs) > 0 && (
                      <>
                        {" "}
                        (~
                        {Math.max(
                          1,
                          Math.ceil(Number(resetStatus.cooldownRemainingNs) / (3600 * 1e9))
                        )}
                        h left)
                      </>
                    )}
                </p>
              )}
              <label style={{ display: "block", fontSize: "0.75rem", color: "#64748b", marginBottom: "0.3rem" }}>
                Type <strong style={{ color: "#f87171" }}>RESET</strong> to enable the button
              </label>
              <input
                type="text"
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                placeholder="RESET"
                disabled={busy || (resetStatus && !resetStatus.allowed)}
                style={{
                  width: "100%",
                  maxWidth: "12rem",
                  boxSizing: "border-box",
                  marginBottom: "0.65rem",
                  padding: "0.45rem 0.6rem",
                  background: "rgba(9, 9, 11, 0.72)",
                  color: "#e2e8f0",
                  border: "1px solid rgba(248, 113, 113, 0.35)",
                  borderRadius: "8px",
                  fontFamily: "ui-monospace, Menlo, monospace",
                  fontSize: "0.85rem",
                }}
              />
              <button
                type="button"
                className="ice-btn ice-btn-danger-strong"
                disabled={
                  busy ||
                  resetConfirm.trim() !== "RESET" ||
                  (resetStatus && !resetStatus.allowed)
                }
                onClick={async () => {
                  const ok = window.confirm(
                    "This will permanently erase all posts, settings, and custom code. Are you sure?"
                  );
                  if (!ok) return;
                  const ok2 = window.confirm(
                    "Final confirmation: factory reset cannot be undone. Continue?"
                  );
                  if (!ok2) return;
                  setBusy(true);
                  flash("", "");
                  try {
                    const factory = await createFactoryActor(identity);
                    if (!factory.requestFactoryReset) {
                      flash("", "Factory reset not available — redeploy factory.");
                      return;
                    }
                    const result = await factory.requestFactoryReset();
                    if (result && "ok" in result) {
                      flash(result.ok, "");
                      setResetConfirm("");
                      await load();
                      if (onUpdated) onUpdated();
                    } else {
                      flash("", (result && result.err) || "Factory reset failed");
                      if (factory.getUserResetStatus) {
                        setResetStatus(await factory.getUserResetStatus());
                      }
                    }
                  } catch (e) {
                    console.error(e);
                    flash("", e?.message || "Factory reset failed");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? "Resetting…" : "Reset to factory state"}
              </button>
            </div>
          ) : (
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#64748b", lineHeight: 1.5 }}>
              Factory reset is only available while this site is <strong style={{ color: "#94a3b8" }}>attached</strong> to
              the ICE network. Reattach from My Site → Network to enable it.
            </p>
          )}
        </div>
      )}

      {/* FEATURES */}
      {sub === "features" && (
        <div className="ice-glass" style={{ padding: "1.15rem 1.25rem" }}>
          <div className="ice-section-title">Features</div>
          <p style={{ margin: "0 0 0.85rem", fontSize: "0.8rem", color: "#94a3b8" }}>
            Toggle site capabilities. Some require the site to be linked to ICE.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
            {featureKeys.map((key) => {
              const meta = DEFAULT_FEATURES.find((f) => f.key === key);
              const on = !!features[key];
              return (
                <div
                  key={key}
                  className="ice-glass-soft"
                  style={{
                    padding: "0.85rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ color: "#e2e8f0", fontWeight: 600, fontSize: "0.9rem" }}>
                      {meta?.label || key}
                    </div>
                    {meta?.hint && (
                      <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "0.2rem" }}>
                        {meta.hint}
                      </div>
                    )}
                    {!meta && (
                      <div style={{ color: "#64748b", fontSize: "0.75rem", marginTop: "0.2rem" }}>
                        Custom feature
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className={on ? "ice-btn-primary" : "ice-btn"}
                    disabled={busy}
                    onClick={() => toggleFeature(key, !on)}
                    style={{ minWidth: "4.5rem" }}
                  >
                    {on ? "On" : "Off"}
                  </button>
                </div>
              );
            })}
          </div>

          <hr className="ice-hr" style={{ margin: "1.25rem 0" }} />
          <div className="ice-section-title">Add feature flag</div>
          <form
            onSubmit={addFeature}
            style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
          >
            <input
              type="text"
              value={newFeatureKey}
              onChange={(e) => setNewFeatureKey(e.target.value)}
              placeholder="featureKey"
              disabled={busy}
              style={{ ...inputStyle, flex: "1 1 160px" }}
            />
            <button type="submit" className="ice-btn" disabled={busy}>
              Add (on)
            </button>
          </form>
        </div>
      )}

      {/* POSTS */}
      {sub === "posts" && (
        <div>
          <form
            onSubmit={publishPost}
            className="ice-glass"
            style={{ padding: "1.15rem 1.25rem", marginBottom: "1rem" }}
          >
            <div className="ice-section-title">Local post</div>
            <p style={{ margin: "0 0 0.65rem", fontSize: "0.8rem", color: "#94a3b8" }}>
              Posts stored on this personal canister (not the main ICE social feed).
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Write something for your personal site…"
              disabled={busy}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <button
              type="submit"
              className="ice-btn-primary"
              disabled={busy || !draft.trim()}
              style={{ marginTop: "0.65rem" }}
            >
              {busy ? "Posting…" : "Publish to canister"}
            </button>
          </form>

          <div className="ice-section-title">Local feed</div>
          {posts.length === 0 ? (
            <div className="ice-empty ice-glass-soft">No posts on this canister yet.</div>
          ) : (
            posts.map((p) => (
              <div
                key={String(p.id)}
                className="ice-glass-soft"
                style={{ padding: "0.9rem 1rem", marginBottom: "0.55rem" }}
              >
                <div style={{ fontSize: "0.7rem", color: "#64748b", marginBottom: "0.35rem" }}>
                  #{String(p.id)}
                </div>
                <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "#e2e8f0", lineHeight: 1.5 }}>
                  {p.content}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

const labelStyle = {
  display: "block",
  color: "#94a3b8",
  fontSize: "0.75rem",
  fontWeight: 600,
  marginBottom: "0.3rem",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0.55rem 0.7rem",
  fontFamily: "inherit",
  fontSize: "0.9rem",
};
