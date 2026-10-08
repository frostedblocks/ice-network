/**
 * Public /u/<username> path helpers (SPA path routing + returnTo).
 */

const RETURN_TO_KEY = "ice-u-returnTo";
const NOTICE_KEY_PREFIX = "ice-u-profile-notice-dismissed:";

/** Match stored/consumed returnTo paths. */
export const RETURN_TO_RE = /^\/u\/[A-Za-z0-9_.%-]{1,150}$/;

/**
 * Parse username slug from a pathname like /u/alice or /u/alice/.
 * Returns lowercase canonical slug, or null if invalid / not a /u route.
 */
export function parseUUsername(pathname = window.location.pathname) {
  try {
    const raw = String(pathname || "");
    const m = raw.match(/^\/u\/([^/]+)\/?$/i);
    if (!m) return null;
    let decoded;
    try {
      decoded = decodeURIComponent(m[1]);
    } catch {
      return null;
    }
    const slug = String(decoded || "").trim();
    if (!slug || slug.length > 150) return null;
    if (slug.includes("/") || slug.includes("\\")) return null;
    if (slug === "." || slug === ".." || slug.includes("..")) return null;
    // Lowercase for usernameIndex lookup; grandfathered names may be outside [a-z0-9_].
    return slug.toLowerCase();
  } catch {
    return null;
  }
}

/** Canonical public path for a username. */
export function publicUPath(username) {
  const slug = String(username || "")
    .trim()
    .toLowerCase();
  if (!slug) return "/u/";
  return `/u/${encodeURIComponent(slug)}`;
}

/**
 * Validate a returnTo path before navigating.
 * Rejects decoded slug segments containing /, \\, ., or ..
 */
export function isValidReturnTo(path) {
  const p = String(path || "");
  if (!RETURN_TO_RE.test(p)) return false;
  const enc = p.slice(3); // after /u/
  let decoded;
  try {
    decoded = decodeURIComponent(enc);
  } catch {
    return false;
  }
  if (!decoded) return false;
  if (decoded.includes("/") || decoded.includes("\\")) return false;
  if (decoded.includes("..") || decoded.includes(".")) return false;
  return true;
}

export function setReturnTo(path) {
  try {
    const p = String(path || "");
    if (!isValidReturnTo(p)) return false;
    sessionStorage.setItem(RETURN_TO_KEY, p);
    return true;
  } catch {
    return false;
  }
}

/** Read and clear returnTo; returns validated path or null. */
export function consumeReturnTo() {
  try {
    const raw = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
    if (!raw) return null;
    return isValidReturnTo(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function noticeStorageKey(principalText) {
  const p = String(principalText || "").trim();
  if (!p) return null;
  return NOTICE_KEY_PREFIX + p;
}

export function isPublicProfileNoticeDismissed(principalText) {
  const key = noticeStorageKey(principalText);
  if (!key) return true;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function dismissPublicProfileNotice(principalText) {
  const key = noticeStorageKey(principalText);
  if (!key) return;
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

const WELCOME_NOTICE_KEY_PREFIX = "ice-welcome-notice-dismissed:";

function welcomeNoticeStorageKey(principalText) {
  const p = String(principalText || "").trim();
  if (!p) return null;
  return WELCOME_NOTICE_KEY_PREFIX + p;
}

export function isWelcomeNoticeDismissed(principalText) {
  const key = welcomeNoticeStorageKey(principalText);
  if (!key) return true;
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function dismissWelcomeNotice(principalText) {
  const key = welcomeNoticeStorageKey(principalText);
  if (!key) return;
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* ignore */
  }
}

/** Strip URLs and HTML-ish markup from bio for noindex public pages. */
export function stripBioLinks(bio) {
  let s = String(bio || "");
  s = s.replace(/<[^>]*>/g, " ");
  s = s.replace(/\bhttps?:\/\/[^\s<>"']+/gi, "");
  s = s.replace(/\bwww\.[^\s<>"']+/gi, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
