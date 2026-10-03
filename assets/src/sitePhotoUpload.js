/** Shared site-canister photo helpers (WebP compress + upload). */

export const MAX_PHOTOS = 10;
/** After browser resize + WebP compression (must match user_site). */
export const MAX_PHOTO_BYTES = 1_572_864; // 1.5 MB
export const MAX_EDGE_PX = 1200;
export const WEBP_QUALITY = 0.82;
export const CHUNK_BYTES = 500_000;
/** Max photos attached to one Store product ad. */
export const MAX_PRODUCT_PHOTOS = 2;

export function formatBytes(n) {
  const v = typeof n === "bigint" ? Number(n) : Number(n) || 0;
  if (!Number.isFinite(v) || v < 0) return "0 B";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
  return `${(v / (1024 * 1024)).toFixed(2)} MB`;
}

export function photoIdKey(id) {
  return typeof id === "bigint" ? id.toString() : String(id);
}

export function agentErrorMessage(err) {
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
export async function compressImageToWebP(
  file,
  { maxEdge = MAX_EDGE_PX, quality = WEBP_QUALITY } = {}
) {
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
    let q = quality;
    while (blob.size > MAX_PHOTO_BYTES && q > 0.4) {
      q = Math.max(0.4, q - 0.12);
      blob = await encode(q);
    }

    if (blob.type && blob.type !== "image/webp") {
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

export function parseQuota(q) {
  if (!q || typeof q !== "object") return null;
  const num = (v) => {
    if (typeof v === "bigint") return Number(v);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  const used = num(q.used ?? q.Used);
  const maxPhotos = num(q.maxPhotos ?? q.max_photos ?? MAX_PHOTOS) || MAX_PHOTOS;
  const maxBytesPerPhoto =
    num(q.maxBytesPerPhoto ?? q.max_bytes_per_photo ?? MAX_PHOTO_BYTES) || MAX_PHOTO_BYTES;
  let remaining = q.remaining != null ? num(q.remaining) : maxPhotos - used;
  if (!Number.isFinite(remaining) || remaining < 0) remaining = Math.max(0, maxPhotos - used);
  return { used, maxPhotos, maxBytesPerPhoto, remaining };
}

export function normalizePhoto(p, siteCanisterId) {
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

export function productPhotoUrl(siteCanisterId, photoId) {
  if (!siteCanisterId || photoId == null || photoId === "") return "";
  return `https://${siteCanisterId}.raw.icp0.io/photos/${photoIdKey(photoId)}`;
}

/** Normalize candid photoIds (vec nat) to string keys. */
export function unwrapPhotoIds(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map(photoIdKey).filter(Boolean);
}

/**
 * Upload a File to the site photo library (compress → uploadPhoto / chunked).
 * onProgress(msg) optional status callback.
 * Returns normalized PhotoMeta.
 */
export async function uploadSitePhoto(site, siteCanisterId, file, { onProgress } = {}) {
  const say = (m) => {
    if (typeof onProgress === "function") onProgress(m);
  };
  say(`Compressing ${file.name || "photo"} to WebP (max ${MAX_EDGE_PX}px)…`);
  const { bytes, contentType } = await compressImageToWebP(file);
  if (bytes.length === 0) throw new Error("Compression produced an empty file.");
  if (bytes.length > MAX_PHOTO_BYTES) {
    throw new Error(
      `Compressed WebP is still too large (${formatBytes(bytes.length)}). Max is 1.5 MB — try a simpler image.`
    );
  }
  if (typeof site.uploadPhoto !== "function") {
    throw new Error("uploadPhoto missing — upgrade this site’s software first.");
  }

  say(`Uploading WebP ${formatBytes(bytes.length)} (from ${formatBytes(file.size)} source)…`);

  let result;
  if (bytes.length <= MAX_PHOTO_BYTES) {
    result = await site.uploadPhoto(contentType, bytes);
  } else if (typeof site.beginChunkedUpload !== "function") {
    throw new Error("Chunked upload unavailable. Upgrade site software.");
  } else {
    const chunkCount = Math.ceil(bytes.length / CHUNK_BYTES);
    const begin = await site.beginChunkedUpload(
      contentType,
      BigInt(bytes.length),
      BigInt(chunkCount)
    );
    if (!begin || !("ok" in begin)) {
      throw new Error((begin && begin.err) || "Could not start chunked upload.");
    }
    const uploadId = begin.ok.uploadId;
    say(`Chunked upload: 0/${chunkCount}…`);
    for (let i = 0; i < chunkCount; i++) {
      const start = i * CHUNK_BYTES;
      const end = Math.min(start + CHUNK_BYTES, bytes.length);
      const slice = bytes.subarray(start, end);
      const ack = await site.uploadPhotoChunk(uploadId, BigInt(i), slice);
      if (typeof ack === "string" && /abort|fail|error|Only/i.test(ack) && !/stored/i.test(ack)) {
        try {
          if (site.abortChunkedUpload) await site.abortChunkedUpload();
        } catch (_) {}
        throw new Error(ack || `Chunk ${i} failed`);
      }
      say(`Chunked upload: ${i + 1}/${chunkCount}…`);
    }
    result = await site.finalizeChunkedUpload(uploadId);
    if (result && "err" in result) {
      try {
        if (site.abortChunkedUpload) await site.abortChunkedUpload();
      } catch (_) {}
    }
  }

  if (result && "ok" in result && result.ok) {
    return normalizePhoto(result.ok, siteCanisterId);
  }
  if (result && "err" in result) {
    throw new Error(result.err || "Upload failed.");
  }
  throw new Error("Upload failed — unexpected canister response.");
}
