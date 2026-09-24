import React, { useCallback, useEffect, useRef, useState } from "react";
import { createUserSiteActor } from "./actors";

const MAX_PHOTOS = 10;
/** After browser resize + WebP compression (must match user_site). */
const MAX_PHOTO_BYTES = 1_572_864; // 1.5 MB
const MAX_EDGE_PX = 1200;
const WEBP_QUALITY = 0.82;
const CHUNK_BYTES = 500_000;

function formatBytes(n) {
  const v = typeof n === "bigint" ? Number(n) : Number(n) || 0;
  if (!Number.isFinite(v) || v < 0) return "0 B";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(2)} MB`;
}

function photoIdKey(id) {
  return typeof id === "bigint" ? id.toString() : String(id);
}

function agentErrorMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  const parts = [
    err.message,
    err.reject_message,
    err.detail?.reject_message,
    Array.isArray(err) ? err.map((x) => x?.message || String(x)).join("; ") : null,
  ].filter(Boolean);
  if (parts.length) return parts.join(" — ");
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Resize to max edge 1200px and encode as WebP via canvas.
 * Returns { bytes: Uint8Array, contentType: "image/webp" }.
 */
async function compressImageToWebP(file, { maxEdge = MAX_EDGE_PX, quality = WEBP_QUALITY } = {}) {
  const bitmap = await createImageBitmap(file);
  try {
    let { width, height } = bitmap;
    if (!width || !height) {
      throw new Error("Could not read image dimensions.");
    }
    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available in this browser.");
    ctx.drawImage(bitmap, 0, 0, w, h);

    // Prefer WebP; fall back to lower quality if still over limit
    const encode = (q) =>
      new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) reject(new Error("WebP encode failed."));
            else resolve(blob);
          },
          "image/webp",
          q
        );
      });

    let blob = await encode(quality);
    // Retry lower quality if over 1.5 MB
    let q = quality;
    while (blob.size > MAX_PHOTO_BYTES && q > 0.4) {
      q = Math.max(0.4, q - 0.12);
      blob = await encode(q);
    }

    if (blob.type && blob.type !== "image/webp") {
      // Safari / older browsers may not produce WebP
      throw new Error(
        "This browser could not export WebP. Use a recent Chrome, Edge, or Firefox."
      );
    }

    const buf = await blob.arrayBuffer();
    return { bytes: new Uint8Array(buf), contentType: "image/webp" };
  } finally {
    if (typeof bitmap.close === "function") bitmap.close();
  }
}

function parseQuota(q) {
  if (!q || typeof q !== "object") return null;
  const num = (v) => {
    if (typeof v === "bigint") return Number(v);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  // Prefer named fields; fall back if candid decoded with hash keys
  const used = num(q.used ?? q.Used);
  const maxPhotos = num(q.maxPhotos ?? q.max_photos ?? MAX_PHOTOS) || MAX_PHOTOS;
  const maxBytesPerPhoto =
    num(q.maxBytesPerPhoto ?? q.max_bytes_per_photo ?? MAX_PHOTO_BYTES) || MAX_PHOTO_BYTES;
  let remaining = q.remaining != null ? num(q.remaining) : maxPhotos - used;
  if (!Number.isFinite(remaining) || remaining < 0) remaining = Math.max(0, maxPhotos - used);
  return { used, maxPhotos, maxBytesPerPhoto, remaining };
}

function normalizePhoto(p, siteCanisterId) {
  if (!p) return null;
  const id = p.id;
  let url = p.url || "";
  const path = p.path || `/photos/${photoIdKey(id)}`;
  if (!url && siteCanisterId) {
    url = `https://${siteCanisterId}.raw.icp0.io${path.startsWith("/") ? path : `/${path}`}`;
  }
  return {
    id,
    contentType: p.contentType || "image/webp",
    size: p.size,
    uploadedAt: p.uploadedAt,
    path,
    url,
  };
}

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
      const { bytes, contentType } = await compressImageToWebP(file);
      if (bytes.length === 0) {
        setError("Compression produced an empty file.");
        return;
      }
      if (bytes.length > MAX_PHOTO_BYTES) {
        setError(
          `Compressed WebP is still too large (${formatBytes(bytes.length)}). Max is 1.5 MB — try a simpler image.`
        );
        return;
      }

      setMsg(
        `Uploading WebP ${formatBytes(bytes.length)} (from ${formatBytes(file.size)} source)…`
      );
      const site = await createUserSiteActor(identity, siteCanisterId);
      if (typeof site.uploadPhoto !== "function") {
        setError("uploadPhoto missing — upgrade this site’s software first.");
        return;
      }

      let result;
      // Prefer single-shot (limit 1.5 MB matches backend)
      if (bytes.length <= MAX_PHOTO_BYTES && typeof site.uploadPhoto === "function") {
        result = await site.uploadPhoto(contentType, bytes);
      } else if (typeof site.beginChunkedUpload !== "function") {
        setError("Chunked upload unavailable. Upgrade site software.");
        return;
      } else {
        const chunkCount = Math.ceil(bytes.length / CHUNK_BYTES);
        const begin = await site.beginChunkedUpload(
          contentType,
          BigInt(bytes.length),
          BigInt(chunkCount)
        );
        if (!begin || !("ok" in begin)) {
          setError((begin && begin.err) || "Could not start chunked upload.");
          return;
        }
        const uploadId = begin.ok.uploadId;
        setMsg(`Chunked upload: 0/${chunkCount}…`);
        for (let i = 0; i < chunkCount; i++) {
          const start = i * CHUNK_BYTES;
          const end = Math.min(start + CHUNK_BYTES, bytes.length);
          const slice = bytes.subarray(start, end);
          const ack = await site.uploadPhotoChunk(uploadId, BigInt(i), slice);
          if (typeof ack === "string" && /abort|fail|error|Only/i.test(ack) && !/stored/i.test(ack)) {
            try {
              if (site.abortChunkedUpload) await site.abortChunkedUpload();
            } catch (_) {}
            setError(ack || `Chunk ${i} failed`);
            return;
          }
          setMsg(`Chunked upload: ${i + 1}/${chunkCount}…`);
        }
        result = await site.finalizeChunkedUpload(uploadId);
        if (result && "err" in result) {
          try {
            if (site.abortChunkedUpload) await site.abortChunkedUpload();
          } catch (_) {}
        }
      }

      if (result && "ok" in result && result.ok) {
        const meta = normalizePhoto(result.ok, siteCanisterId);
        setMsg(
          `Uploaded WebP #${photoIdKey(meta.id)} (${formatBytes(meta.size)}).`
        );
        await load();
      } else if (result && "err" in result) {
        setError(result.err || "Upload failed.");
      } else {
        setError("Upload failed — unexpected canister response.");
      }
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
