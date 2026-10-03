import React, { useCallback, useEffect, useRef, useState } from "react";
import { createUserSiteActor } from "./actors";
import {
  MAX_PHOTOS,
  MAX_PHOTO_BYTES,
  MAX_EDGE_PX,
  agentErrorMessage,
  formatBytes,
  normalizePhoto,
  parseQuota,
  photoIdKey,
  uploadSitePhoto,
} from "./sitePhotoUpload";

/**
 * Owner photo library on the personal user_site canister.
 * Bytes live only on the user canister; ICE main stores public URLs (links).
 */
export default function SitePhotos({ identity, siteCanisterId }) {
  const [photos, setPhotos] = useState([]);
  const [quota, setQuota] = useState(null);
  const [bannerUrl, setBannerUrl] = useState("");
  const [siteOwner, setSiteOwner] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const fileRef = useRef(null);

  const principalText = identity?.getPrincipal?.()?.toText?.() || "";

  const load = useCallback(async () => {
    if (!identity || !siteCanisterId) {
      setPhotos([]);
      setQuota(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const site = await createUserSiteActor(identity, siteCanisterId);
      if (typeof site.listPhotos !== "function" || typeof site.getPhotoQuota !== "function") {
        setError(
          "Photo storage is not available on this site yet. Open My Site → Domain & DNS → Upgrade site software."
        );
        setPhotos([]);
        setQuota(null);
        return;
      }

      const tasks = [site.listPhotos(), site.getPhotoQuota()];
      if (typeof site.getBannerURL === "function") tasks.push(site.getBannerURL());
      else tasks.push(Promise.resolve(""));
      if (typeof site.getOwner === "function") tasks.push(site.getOwner());
      else tasks.push(Promise.resolve(null));

      const [list, q, banner, owner] = await Promise.all(tasks);
      setPhotos(
        (Array.isArray(list) ? list : [])
          .map((p) => normalizePhoto(p, siteCanisterId))
          .filter(Boolean)
      );
      setQuota(parseQuota(q));
      setBannerUrl(typeof banner === "string" ? banner : "");
      const ot =
        owner && typeof owner.toText === "function"
          ? owner.toText()
          : owner
          ? String(owner)
          : "";
      setSiteOwner(ot);
    } catch (e) {
      console.error(e);
      setError(agentErrorMessage(e) || "Could not load photos from your site canister.");
    } finally {
      setLoading(false);
    }
  }, [identity, siteCanisterId]);

  useEffect(() => {
    load();
  }, [load]);

  const used = quota ? quota.used : photos.length;
  const max = quota ? quota.maxPhotos : MAX_PHOTOS;
  const remaining = Math.max(0, max - used);
  const ownerMismatch =
    principalText && siteOwner && principalText !== siteOwner;

  const handleUploadClick = () => {
    setError("");
    setMsg("");
    if (ownerMismatch) {
      setError(
        `This site canister owner is ${siteOwner}, but you are signed in as ${principalText}. Upload requires the owner Internet Identity. Ops can run adminSyncSiteOwner after factory mapping is correct.`
      );
      return;
    }
    if (used >= max) {
      setError(
        `Photo limit reached: ${used} of ${max} used. Delete a photo before uploading another.`
      );
      return;
    }
    fileRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !identity || !siteCanisterId) return;

    if (ownerMismatch) {
      setError(
        `Cannot upload: site owner is ${siteOwner}, you are ${principalText}.`
      );
      return;
    }
    if (used >= max) {
      setError(
        `Photo limit reached: ${used} of ${max} used. Delete a photo before uploading another.`
      );
      return;
    }
    if (file.size === 0) {
      setError("Empty file. Choose an image to upload.");
      return;
    }
    if (!(file.type || "").startsWith("image/") && !/\.(jpe?g|png|gif|webp|bmp|heic)$/i.test(file.name || "")) {
      setError("Please choose an image file. It will be resized and converted to WebP.");
      return;
    }

    setBusy(true);
    setError("");
    setMsg(`Compressing ${file.name || "photo"} to WebP (max ${MAX_EDGE_PX}px)…`);
    try {
      const site = await createUserSiteActor(identity, siteCanisterId);
      const meta = await uploadSitePhoto(site, siteCanisterId, file, {
        onProgress: (m) => setMsg(m),
      });
      setMsg(`Uploaded WebP #${photoIdKey(meta.id)} (${formatBytes(meta.size)}).`);
      await load();
    } catch (err) {
      console.error(err);
      let msgText = agentErrorMessage(err);
      if (/Invalid .*blob|type mismatch|Wrong argument/i.test(msgText)) {
        msgText += " (Encoding issue — hard-refresh and retry.)";
      }
      if (/timeout|deadline|ingress/i.test(msgText)) {
        msgText += " Try again in a moment.";
      }
      if (/WebP|createImageBitmap|Canvas/i.test(msgText)) {
        msgText = err.message || msgText;
      }
      setError(msgText || "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id) => {
    if (!identity || !siteCanisterId) return;
    if (!window.confirm(`Delete photo #${photoIdKey(id)}? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const site = await createUserSiteActor(identity, siteCanisterId);
      const text = await site.deletePhoto(typeof id === "bigint" ? id : BigInt(id));
      setMsg(typeof text === "string" ? text : "Deleted.");
      await load();
    } catch (err) {
      console.error(err);
      setError(agentErrorMessage(err) || "Delete failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleUseBanner = async (photo) => {
    if (!identity || !siteCanisterId) return;
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const site = await createUserSiteActor(identity, siteCanisterId);
      const text = await site.usePhotoAsBanner(
        typeof photo.id === "bigint" ? photo.id : BigInt(photo.id)
      );
      if (typeof text === "string" && /Banner set/i.test(text)) {
        setMsg("Banner link set on your site. Image stays on your site canister.");
        await load();
      } else {
        setError(text || "Could not set banner.");
      }
    } catch (err) {
      console.error(err);
      setError(agentErrorMessage(err) || "Could not set banner.");
    } finally {
      setBusy(false);
    }
  };

  if (!siteCanisterId) {
    return (
      <section className="ice-profile-card">
        <div className="ice-profile-card-head">
          <h3>Photos</h3>
          <p>Stored on your personal site canister.</p>
        </div>
        <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem", lineHeight: 1.5 }}>
          Join ICE and mint a site first (My Site). Photos are stored on your user canister only —
          FrostedBlocks keeps image links, never the file data.
        </p>
      </section>
    );
  }

  return (
    <section className="ice-profile-card" style={{ gridColumn: "1 / -1" }}>
      <div className="ice-profile-card-head">
        <h3>Photos</h3>
        <p>
          {used} of {max} used
          {remaining > 0 ? ` · ${remaining} slot${remaining === 1 ? "" : "s"} left` : " · full"}
        </p>
      </div>

      <p
        style={{
          margin: "0 0 0.85rem",
          color: "#94a3b8",
          fontSize: "0.85rem",
          lineHeight: 1.55,
        }}
      >
        Upload up to 10 photos. Images are resized (max 1200px) and converted to WebP in your browser
        before upload (max 1.5 MB each). Only compressed WebP is stored on your site canister. You can
        use one as a banner. Only you can manage them. Photos listed here are public on the internet — there is no private album yet.
      </p>

      <div
        style={{
          marginBottom: "0.85rem",
          padding: "0.65rem 0.75rem",
          background: "rgba(0,0,0,0.28)",
          borderRadius: 8,
          fontSize: "0.75rem",
          color: "#64748b",
          lineHeight: 1.45,
        }}
      >
        Images are stored and served by your site canister{" "}
        <code style={{ color: "#cbd5e1", wordBreak: "break-all" }}>{siteCanisterId}</code>
        {siteOwner ? (
          <>
            {" "}
            · owner{" "}
            <code style={{ color: ownerMismatch ? "#fbbf24" : "#cbd5e1" }}>
              {siteOwner.slice(0, 12)}…
            </code>
          </>
        ) : null}
        . The main network only saves the public link (canister + path).
      </div>

      {ownerMismatch && (
        <p
          style={{
            margin: "0 0 0.85rem",
            color: "#fbbf24",
            fontSize: "0.8rem",
            lineHeight: 1.45,
            fontWeight: 600,
          }}
        >
          Owner mismatch: uploads require the Internet Identity that owns this site canister.
        </p>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/*,.jpg,.jpeg,.png,.gif,.webp"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.85rem" }}>
        <button
          type="button"
          className="ice-btn-primary"
          disabled={busy || loading || used >= max || ownerMismatch}
          onClick={handleUploadClick}
          title={
            ownerMismatch
              ? "Signed-in identity is not the site owner"
              : used >= max
              ? "Delete a photo to free a slot"
              : "Upload photo (auto WebP ≤1.5 MB, max 1200px)"
          }
        >
          {busy ? "Working…" : "Upload Photo"}
        </button>
        <button type="button" className="ice-btn" disabled={busy || loading} onClick={load}>
          Refresh
        </button>
      </div>

      {loading ? (
        <p style={{ color: "#64748b", fontSize: "0.85rem" }}>Loading photos…</p>
      ) : photos.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: "0.85rem" }}>No photos yet.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {photos.map((p) => {
            const id = p.id;
            const url = p.url || "";
            const isBanner = bannerUrl && url && bannerUrl === url;
            return (
              <div
                key={photoIdKey(id)}
                style={{
                  border: "1px solid rgba(148,163,184,0.2)",
                  borderRadius: 10,
                  overflow: "hidden",
                  background: "rgba(9,9,11,0.55)",
                }}
              >
                <a href={url} target="_blank" rel="noreferrer" style={{ display: "block" }}>
                  <img
                    src={url}
                    alt={`Photo ${photoIdKey(id)}`}
                    style={{
                      width: "100%",
                      height: 120,
                      objectFit: "cover",
                      display: "block",
                      background: "#0f172a",
                    }}
                    onError={(ev) => {
                      ev.currentTarget.style.opacity = "0.35";
                    }}
                  />
                </a>
                <div style={{ padding: "0.5rem 0.55rem", fontSize: "0.72rem", color: "#94a3b8" }}>
                  <div style={{ color: "#e2e8f0", fontWeight: 600, marginBottom: "0.2rem" }}>
                    #{photoIdKey(id)} · {formatBytes(p.size)}
                  </div>
                  {isBanner && (
                    <div style={{ color: "#7dd3fc", marginBottom: "0.35rem" }}>Banner</div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    <button
                      type="button"
                      className="ice-btn ice-btn-xs"
                      disabled={busy || ownerMismatch}
                      onClick={() => handleUseBanner(p)}
                    >
                      Use as banner
                    </button>
                    <button
                      type="button"
                      className="ice-btn ice-btn-xs"
                      disabled={busy || ownerMismatch}
                      style={{ borderColor: "rgba(248,113,113,0.45)", color: "#fca5a5" }}
                      onClick={() => handleDelete(id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {msg && (
        <p className="ice-inline-ok" style={{ marginTop: "0.75rem" }}>
          {msg}
        </p>
      )}
      {error && (
        <p className="ice-inline-err" style={{ marginTop: "0.75rem", whiteSpace: "pre-wrap" }}>
          {error}
        </p>
      )}
    </section>
  );
}
