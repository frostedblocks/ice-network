import React, { useEffect, useState } from "react";
import {
  fetchStoreCommerceEnabled,
  invalidateStoreCommerceCache,
} from "./storeCommerce";

/**
 * Master-only: one switch to hide/show all Store commerce UI network-wide.
 * Default off. Does not delete Store/Connect code.
 */
export default function MasterStoreCommerceControls({ actor }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = async () => {
    if (!actor) return;
    setLoading(true);
    setErr("");
    try {
      const v = await fetchStoreCommerceEnabled(actor);
      setOn(!!v);
    } catch (e) {
      console.error(e);
      setErr("Could not load Store commerce setting.");
      setOn(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [actor]);

  const save = async (next) => {
    if (!actor?.adminSetStoreCommerceEnabled) {
      setErr("adminSetStoreCommerceEnabled missing — upgrade the ice canister.");
      return;
    }
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const result = await actor.adminSetStoreCommerceEnabled(!!next);
      const text = typeof result === "string" ? result : "Saved.";
      if (/not authorized/i.test(text)) {
        setErr(text);
      } else {
        invalidateStoreCommerceCache();
        setOn(!!next);
        setMsg(text);
        await fetchStoreCommerceEnabled(actor);
      }
    } catch (e) {
      console.error(e);
      setErr(e?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p style={{ color: "#64748b" }}>Loading Store commerce gate…</p>;
  }

  return (
    <div className="ice-profile-card ice-profile-card--nested">
      <div className="ice-profile-card-head">
        <h3>Store commerce</h3>
        <p>
          One switch for the whole network. When off, Store in My Site, product lists, Buy buttons,
          checkout, and seller Connect UI stay hidden. Store/Connect code remains installed — turn
          this on after the Delaware LLC and seller payouts are ready.
        </p>
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div style={{ fontWeight: 700, color: "#e2e8f0" }}>
            {on ? "Store commerce is ON" : "Store commerce is OFF (default)"}
          </div>
          <div style={{ color: "#94a3b8", fontSize: "0.82rem", marginTop: 4 }}>
            {on
              ? "Sellers can open Store and buyers can see Buy when Connect is configured."
              : "All store commerce surfaces are hidden for everyone."}
          </div>
        </div>
        <button
          type="button"
          className={`ice-btn${on ? " ice-btn-warn" : " ice-btn-primary"}`}
          disabled={saving}
          onClick={() => save(!on)}
        >
          {saving ? "Saving…" : on ? "Turn Store off" : "Turn Store on"}
        </button>
      </div>
      {msg ? (
        <p style={{ color: "#86efac", marginTop: "0.75rem", fontSize: "0.85rem" }}>{msg}</p>
      ) : null}
      {err ? (
        <p style={{ color: "#fca5a5", marginTop: "0.75rem", fontSize: "0.85rem" }}>{err}</p>
      ) : null}
    </div>
  );
}
