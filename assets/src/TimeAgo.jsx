import React from "react";

/** Motoko Time (ns) → ms */
export function timestampToMs(timestamp) {
  if (timestamp === null || timestamp === undefined) return null;
  const n = Number(timestamp);
  if (!Number.isFinite(n)) return null;
  return n / 1_000_000;
}

/**
 * Calendar activity bucket for public feed chips.
 * @returns {"today"|"week"|null}
 */
export function activityBucket(timestamp, nowMs = Date.now()) {
  const ms = timestampToMs(timestamp);
  if (ms === null) return null;
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  if (ms >= startOfToday.getTime()) return "today";
  const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
  if (ms >= weekAgo) return "week";
  return null;
}

export default function TimeAgo({ timestamp }) {
  if (!timestamp) return null;

  const ms = timestampToMs(timestamp);
  if (ms === null) return null;
  const now = Date.now();
  const diff = Math.max(0, now - ms);

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  let text;
  if (seconds < 60) text = "just now";
  else if (minutes < 60) text = `${minutes}m ago`;
  else if (hours < 24) text = `${hours}h ago`;
  else if (days < 7) text = `${days}d ago`;
  else {
    const date = new Date(ms);
    text = date.toLocaleDateString();
  }

  return (
    <span style={{ fontSize: "0.8rem", color: "#64748b" }} title={new Date(ms).toLocaleString()}>
      {text}
    </span>
  );
}
