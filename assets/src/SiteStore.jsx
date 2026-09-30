import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createUserSiteActor, publicSiteHash } from "./actors";
import { unwrapOpt } from "./candidUtils";
import { copyTextToClipboard } from "./copyText";

const CONNECT_ORIGIN = String(import.meta.env.VITE_CONNECT_API_ORIGIN || "").replace(/\/$/, "");
const CONNECT_SETUP_MSG =
  "Connect backend not configured — rebuild assets with VITE_CONNECT_API_ORIGIN set to your Connect backend origin (see docs/CONNECT_OPS.md).";
const DISCLOSURE =
  "You pay the seller via Stripe. Frostblocks does not hold this payment.";
const SHARE_PREFIX =
  "I opened a little store — pay me direct via Stripe. Grab what you want here: ";

function formatVariant(v) {
  if (!v || typeof v !== "object") return "social";
  if ("store" in v) return "store";
  if ("social" in v) return "social";
  return "social";
}

function maskAccountId(id) {
  const s = String(id || "");
  if (s.length <= 10) return s ? `${s.slice(0, 4)}…` : "";
  return `${s.slice(0, 7)}…${s.slice(-4)}`;
}

function centsFromDollars(raw) {
  const n = Number(String(raw || "").replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

function formatPrice(cents, currency = "usd") {
  const n = typeof cents === "bigint" ? Number(cents) : Number(cents);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: String(currency || "usd").toUpperCase(),
    }).format(n / 100);
  } catch {
    return `$${(n / 100).toFixed(2)}`;
  }
}

function optText(v) {
  const u = unwrapOpt(v);
  return u == null ? "" : String(u);
}

function productIdKey(id) {
  return typeof id === "bigint" ? id.toString() : String(id);
}

function formatTime(ts) {
  try {
    const n = typeof ts === "bigint" ? Number(ts) : Number(ts);
    const ms = n > 1e15 ? n / 1e6 : n;
    return new Date(ms).toLocaleString();
  } catch {
    return "";
  }
}


/**
 * Build Connect owner proof for the backend.
 * II: DelegationIdentity → inner Ed25519 session JSON + delegation chain.
 * Local: Ed25519KeyIdentity.toJSON().
 * Requires AuthClient keyType Ed25519 (see App.jsx).
 */
function buildConnectOwnerProof(identity, challenge) {
  if (!identity) throw new Error("Not signed in");
  if (!challenge) throw new Error("Missing owner challenge");

  // Internet Identity / DelegationIdentity
  if (typeof identity.getDelegation === "function") {
    const inner = identity._inner;
    if (!inner || typeof inner.toJSON !== "function") {
      throw new Error(
        "Connect requires an Ed25519 II session. Sign out and sign in again, then retry."
      );
    }
    let sessionIdentity;
    try {
      sessionIdentity = inner.toJSON();
    } catch (e) {
      throw new Error(
        "Could not export II session key for Connect proof. Sign out/in and retry."
      );
    }
    const chain = identity.getDelegation();
    const delegation =
      chain && typeof chain.toJSON === "function" ? chain.toJSON() : chain;
    return { challenge, sessionIdentity, delegation };
  }

  // Local / raw Ed25519KeyIdentity
  if (typeof identity.toJSON === "function") {
    return { challenge, sessionIdentity: identity.toJSON() };
  }

  throw new Error("Unsupported identity for Stripe Connect owner proof");
}

/**
 * My Site → Store: format toggle, Stripe Connect (OAuth), product CRUD, share link.
 */
export default function SiteStore({ identity, siteId }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [format, setFormat] = useState("social");
  const [stripe, setStripe] = useState(null);
  const [products, setProducts] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [copied, setCopied] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceDollars, setPriceDollars] = useState("");
  const [imageURL, setImageURL] = useState("");
  const [editId, setEditId] = useState(null);

  const ownerPrincipal = useMemo(() => {
    try {
      return identity?.getPrincipal?.()?.toText?.() || "";
    } catch {
      return "";
    }
  }, [identity]);

  const storePublicUrl = useMemo(() => {
    try {
      const base = window.location.origin + window.location.pathname;
      return `${base}${publicSiteHash(siteId, "store")}`;
    } catch {
      return publicSiteHash(siteId, "store");
    }
  }, [siteId]);

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
      let fmt = "social";
      try {
        fmt = formatVariant(await site.getFormat());
      } catch {
        fmt = "social";
      }
      setFormat(fmt);

      let stripeCfg = null;
      try {
        stripeCfg = unwrapOpt(await site.getStripePublic());
      } catch {
        stripeCfg = null;
      }
      setStripe(stripeCfg || null);

      let list = [];
      try {
        if (site.listAllProducts) list = await site.listAllProducts();
        else list = await site.listProducts();
      } catch {
        list = [];
      }
      setProducts(Array.isArray(list) ? list : []);

      let rcpt = [];
      try {
        if (site.listReceipts) rcpt = await site.listReceipts();
      } catch {
        rcpt = [];
      }
      setReceipts(Array.isArray(rcpt) ? rcpt : []);
    } catch (e) {
      console.error(e);
      setError(e?.message || "Failed to load store settings.");
    } finally {
      setLoading(false);
    }
  }, [identity, siteId]);

  useEffect(() => {
    load();
  }, [load]);

  // After Stripe Connect OAuth return: ?connect=success → fetch result (backend bindStripePublic)
  useEffect(() => {
    if (!identity || !siteId || !CONNECT_ORIGIN) return;
    let params;
    try {
      params = new URLSearchParams(window.location.search || "");
    } catch {
      return;
    }
    if (params.get("connect") !== "success") return;

    let cancelled = false;
    (async () => {
      setBusy(true);
      flash("", "");
      try {
        const res = await fetch(
          `${CONNECT_ORIGIN}/api/connect/result?siteId=${encodeURIComponent(siteId)}`,
          { credentials: "include" }
        );
        if (!res.ok) {
          throw new Error(`Connect result failed (HTTP ${res.status})`);
        }
        const data = await res.json();
        const accountId = data?.accountId || data?.stripeAccountId || "";
        if (!accountId) {
          throw new Error("Connect result missing accountId.");
        }
        // Backend trusted recorder already called bindStripePublic — owner cannot paste ids.
        if (cancelled) return;
        flash(data?.bound || "Stripe connected.", "");
        await load();
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          flash("", e?.message || "Could not finish Stripe Connect.");
        }
      } finally {
        if (!cancelled) setBusy(false);
        try {
          params.delete("connect");
          const qs = params.toString();
          const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash || ""}`;
          window.history.replaceState(null, "", next);
        } catch {
          /* ignore */
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [identity, siteId, load]);

  const setSiteFormat = async (next) => {
    if (!identity || !siteId || busy) return;
    setBusy(true);
    flash("", "");
    try {
      const site = await createUserSiteActor(identity, siteId);
      const out = await site.setFormat(next === "store" ? { store: null } : { social: null });
      setFormat(next);
      flash(typeof out === "string" ? out : `Format set to ${next}`, "");
    } catch (e) {
      console.error(e);
      flash("", e?.message || "Failed to set format.");
    } finally {
      setBusy(false);
    }
  };

  const startConnect = async () => {
    if (!CONNECT_ORIGIN) {
      flash("", CONNECT_SETUP_MSG);
      return;
    }
    if (!siteId || !identity) {
      flash("", "Missing site or sign-in identity.");
      return;
    }
    setBusy(true);
    flash("", "");
    try {
      // 1) Server-issued challenge bound to this siteId
      const chRes = await fetch(`${CONNECT_ORIGIN}/api/connect/challenge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ siteId }),
      });
      if (!chRes.ok) {
        let detail = `Connect challenge failed (HTTP ${chRes.status})`;
        try {
          const errBody = await chRes.json();
          if (errBody?.error) detail = errBody.error;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const chData = await chRes.json();
      const challenge = chData?.challenge;
      if (!challenge) throw new Error("Connect challenge missing token.");

      // 2) Prove II/session control (session key + optional delegation)
      const proof = buildConnectOwnerProof(identity, challenge);

      // 3) Start OAuth only after backend verifies principal === getOwner
      const res = await fetch(`${CONNECT_ORIGIN}/api/connect/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          siteId,
          challenge: proof.challenge,
          sessionIdentity: proof.sessionIdentity,
          delegation: proof.delegation,
        }),
      });
      if (!res.ok) {
        let detail = `Connect start failed (HTTP ${res.status})`;
        try {
          const errBody = await res.json();
          if (errBody?.error) detail = errBody.error;
        } catch {
          /* ignore */
        }
        throw new Error(detail);
      }
      const data = await res.json();
      const url = data?.url || data?.redirectUrl || data?.authorizeUrl;
      if (!url) throw new Error("Connect start did not return a redirect url.");
      window.location.href = url;
    } catch (e) {
      console.error(e);
      flash("", e?.message || "Could not start Stripe Connect.");
      setBusy(false);
    }
  };

  const clearStripe = async () => {
    if (!identity || !siteId || busy) return;
    if (!window.confirm("Disconnect Stripe public config from this site?")) return;
    setBusy(true);
    flash("", "");
    try {
      const site = await createUserSiteActor(identity, siteId);
      const out = await site.clearStripePublic();
      flash(typeof out === "string" ? out : "Cleared", "");
      setStripe(null);
      await load();
    } catch (e) {
      console.error(e);
      flash("", e?.message || "Failed to clear Stripe config.");
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setEditId(null);
    setTitle("");
    setDescription("");
    setPriceDollars("");
    setImageURL("");
  };

  const beginEdit = (p) => {
    setEditId(productIdKey(p.id));
    setTitle(p.title || "");
    setDescription(p.description || "");
    const cents = typeof p.priceCents === "bigint" ? Number(p.priceCents) : Number(p.priceCents);
    setPriceDollars(Number.isFinite(cents) ? (cents / 100).toFixed(2) : "");
    setImageURL(optText(p.imageURL));
  };

  const saveProduct = async (e) => {
    e?.preventDefault?.();
    if (!identity || !siteId || busy) return;
    const cents = centsFromDollars(priceDollars);
    if (!title.trim()) {
      flash("", "Title required.");
      return;
    }
    if (cents == null || cents <= 0) {
      flash("", "Enter a price greater than 0 (USD).");
      return;
    }
    const imgOpt = imageURL.trim() ? [imageURL.trim()] : [];
    setBusy(true);
    flash("", "");
    try {
      const site = await createUserSiteActor(identity, siteId);
      if (editId != null) {
        const existing = products.find((p) => productIdKey(p.id) === String(editId));
        const active = existing ? !!existing.active : true;
        const out = await site.updateProduct(
          BigInt(editId),
          title.trim(),
          description.trim(),
          BigInt(cents),
          "usd",
          imgOpt,
          active
        );
        flash(typeof out === "string" ? out : "Updated", "");
      } else {
        const result = await site.createProduct(
          title.trim(),
          description.trim(),
          BigInt(cents),
          "usd",
          imgOpt
        );
        if (result && "err" in result && result.err) {
          flash("", result.err);
        } else {
          flash("Product created.", "");
        }
      }
      resetForm();
      await load();
    } catch (err) {
      console.error(err);
      flash("", err?.message || "Failed to save product.");
    } finally {
      setBusy(false);
    }
  };

  const deactivateProduct = async (p) => {
    if (!identity || !siteId || busy) return;
    if (!window.confirm(`Deactivate “${p.title}”?`)) return;
    setBusy(true);
    flash("", "");
    try {
      const site = await createUserSiteActor(identity, siteId);
      const out = await site.deleteProduct(typeof p.id === "bigint" ? p.id : BigInt(p.id));
      flash(typeof out === "string" ? out : "Deactivated", "");
      await load();
    } catch (err) {
      console.error(err);
      flash("", err?.message || "Failed to deactivate product.");
    } finally {
      setBusy(false);
    }
  };

  const shareStore = async () => {
    const text = `${SHARE_PREFIX}${storePublicUrl}`;
    const ok = await copyTextToClipboard(text);
    if (ok) {
      setCopied(true);
      flash("Share text copied.", "");
      setTimeout(() => setCopied(false), 2000);
    } else {
      flash("", "Could not copy — select and copy manually.");
    }
  };

  if (loading) {
    return <div className="ice-loading">Loading store…</div>;
  }

  return (
    <div className="ice-site-store">
      <div className="ice-glass" style={{ padding: "1.15rem 1.25rem", marginBottom: "0.85rem" }}>
        <div className="ice-section-title">Site format</div>
        <p style={{ margin: "0 0 0.75rem", color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.5 }}>
          Social keeps the public profile and feed. Store adds a Stripe product grid on the public
          site.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            type="button"
            className={format === "social" ? "ice-btn-primary" : "ice-btn"}
            disabled={busy}
            onClick={() => setSiteFormat("social")}
          >
            Social
          </button>
          <button
            type="button"
            className={format === "store" ? "ice-btn-primary" : "ice-btn"}
            disabled={busy}
            onClick={() => setSiteFormat("store")}
          >
            Store
          </button>
        </div>
        <p
          style={{
            margin: "0.85rem 0 0",
            padding: "0.65rem 0.75rem",
            borderRadius: 10,
            background: "rgba(251, 191, 36, 0.08)",
            border: "1px solid rgba(251, 191, 36, 0.28)",
            color: "#fde68a",
            fontSize: "0.82rem",
            lineHeight: 1.45,
          }}
        >
          {DISCLOSURE}
        </p>
      </div>

      <div className="ice-glass" style={{ padding: "1.15rem 1.25rem", marginBottom: "0.85rem" }}>
        <div className="ice-section-title">Stripe Connect</div>
        <p style={{ margin: "0 0 0.75rem", color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.5 }}>
          Connect an Express account so buyers pay you directly. No secret keys are stored on the
          canister — only the public account id and publishable key.
        </p>
        {!CONNECT_ORIGIN ? (
          <p className="ice-alert-error" style={{ marginBottom: "0.75rem" }}>
            {CONNECT_SETUP_MSG}
          </p>
        ) : null}
        {stripe?.accountId ? (
          <p style={{ margin: "0 0 0.75rem", color: "#cbd5e1", fontSize: "0.88rem" }}>
            Connected:{" "}
            <span className="ice-mono" style={{ color: "#86efac" }}>
              {maskAccountId(stripe.accountId)}
            </span>
          </p>
        ) : (
          <p style={{ margin: "0 0 0.75rem", color: "#94a3b8", fontSize: "0.85rem" }}>
            Not connected yet.
          </p>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          <button
            type="button"
            className="ice-btn-primary"
            disabled={busy || !CONNECT_ORIGIN}
            onClick={startConnect}
          >
            {busy ? "Working…" : "Connect with Stripe"}
          </button>
          {stripe?.accountId ? (
            <button type="button" className="ice-btn" disabled={busy} onClick={clearStripe}>
              Disconnect
            </button>
          ) : null}
          <button type="button" className="ice-btn" disabled={busy} onClick={shareStore}>
            {copied ? "Copied" : "Copy share text"}
          </button>
        </div>
        <p style={{ margin: "0.75rem 0 0", fontSize: "0.75rem", color: "#64748b", wordBreak: "break-all" }}>
          Store URL: {storePublicUrl}
        </p>
      </div>

      {(error || msg) && (
        <div
          className={error ? "ice-alert-error" : "ice-alert-ok"}
          style={{ marginBottom: "0.85rem" }}
        >
          {error || msg}
        </div>
      )}

      <div className="ice-glass" style={{ padding: "1.15rem 1.25rem", marginBottom: "0.85rem" }}>
        <div className="ice-section-title">{editId != null ? "Edit product" : "Add product"}</div>
        <form onSubmit={saveProduct}>
          <label style={labelStyle}>
            Title
            <input
              className="ice-input"
              value={title}
              onChange={(ev) => setTitle(ev.target.value)}
              maxLength={120}
              required
            />
          </label>
          <label style={labelStyle}>
            Description
            <textarea
              className="ice-input"
              value={description}
              onChange={(ev) => setDescription(ev.target.value)}
              rows={3}
              maxLength={2000}
              style={{ resize: "vertical" }}
            />
          </label>
          <label style={labelStyle}>
            Price (USD)
            <input
              className="ice-input"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              value={priceDollars}
              onChange={(ev) => setPriceDollars(ev.target.value)}
              placeholder="9.99"
              required
            />
          </label>
          <label style={labelStyle}>
            Image URL (optional)
            <input
              className="ice-input"
              value={imageURL}
              onChange={(ev) => setImageURL(ev.target.value)}
              placeholder="https://…"
            />
          </label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.35rem" }}>
            <button type="submit" className="ice-btn-primary" disabled={busy}>
              {busy ? "Saving…" : editId != null ? "Update product" : "Create product"}
            </button>
            {editId != null ? (
              <button type="button" className="ice-btn" disabled={busy} onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="ice-glass" style={{ padding: "1.15rem 1.25rem", marginBottom: "0.85rem" }}>
        <div className="ice-section-title">Products</div>
        {products.length === 0 ? (
          <div className="ice-empty ice-glass-soft">No products yet.</div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {products.map((p) => {
              const img = optText(p.imageURL);
              return (
                <li
                  key={productIdKey(p.id)}
                  className="ice-glass-soft"
                  style={{
                    padding: "0.85rem 1rem",
                    marginBottom: "0.55rem",
                    display: "flex",
                    gap: "0.85rem",
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                    opacity: p.active ? 1 : 0.55,
                  }}
                >
                  {img ? (
                    <img
                      src={img}
                      alt=""
                      style={{
                        width: 64,
                        height: 64,
                        objectFit: "cover",
                        borderRadius: 10,
                        flexShrink: 0,
                      }}
                      onError={(ev) => {
                        ev.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 650, color: "#f8fafc" }}>
                      {p.title}{" "}
                      {!p.active ? (
                        <span className="ice-status ice-status-muted">Inactive</span>
                      ) : null}
                    </div>
                    <div style={{ color: "#86efac", fontSize: "0.9rem", marginTop: 2 }}>
                      {formatPrice(p.priceCents, p.currency)}
                    </div>
                    {p.description ? (
                      <p
                        style={{
                          margin: "0.35rem 0 0",
                          color: "#94a3b8",
                          fontSize: "0.82rem",
                          lineHeight: 1.45,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {p.description}
                      </p>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                    <button
                      type="button"
                      className="ice-btn"
                      disabled={busy}
                      onClick={() => beginEdit(p)}
                    >
                      Edit
                    </button>
                    {p.active ? (
                      <button
                        type="button"
                        className="ice-btn"
                        disabled={busy}
                        onClick={() => deactivateProduct(p)}
                      >
                        Deactivate
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {receipts.length > 0 && (
        <div className="ice-glass" style={{ padding: "1.15rem 1.25rem" }}>
          <div className="ice-section-title">Receipts</div>
          <p style={{ margin: "0 0 0.65rem", color: "#94a3b8", fontSize: "0.8rem" }}>
            Public summaries only — no buyer email or name.
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {receipts
              .slice()
              .sort((a, b) => Number(b.recordedAt) - Number(a.recordedAt))
              .slice(0, 20)
              .map((r) => (
                <li
                  key={productIdKey(r.id)}
                  style={{
                    padding: "0.45rem 0",
                    borderBottom: "1px solid rgba(148,163,184,0.12)",
                    fontSize: "0.82rem",
                    color: "#cbd5e1",
                  }}
                >
                  #{productIdKey(r.id)} · product {productIdKey(r.productId)} ·{" "}
                  {formatPrice(r.amountCents, r.currency)} · {formatTime(r.recordedAt)}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const labelStyle = {
  display: "block",
  marginBottom: "0.65rem",
  color: "#94a3b8",
  fontSize: "0.78rem",
  fontWeight: 600,
};
