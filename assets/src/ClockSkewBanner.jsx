import React, { useEffect, useState } from "react";
import { CLOCK_SKEW_EVENT, syncAllAgents } from "./icErrors";

/** Global banner shown when IC calls still fail on clock/certificate time after a retry. */
export default function ClockSkewBanner() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const on = () => setVisible(true);
    window.addEventListener(CLOCK_SKEW_EVENT, on);
    return () => window.removeEventListener(CLOCK_SKEW_EVENT, on);
  }, []);

  if (!visible) return null;

  const retry = async () => {
    setBusy(true);
    await syncAllAgents();
    window.location.reload();
  };

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "1rem",
        transform: "translateX(-50%)",
        zIndex: 1000,
        maxWidth: "min(32rem, calc(100vw - 2rem))",
        background: "rgba(15, 23, 42, 0.96)",
        border: "1px solid rgba(251, 191, 36, 0.5)",
        borderRadius: 12,
        padding: "0.85rem 1rem",
        color: "#E2E8F0",
        boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
      }}
    >
      <strong style={{ color: "#FBBF24" }}>Clock Synchronization Issue</strong>
      <p style={{ margin: "0.4rem 0 0.6rem", fontSize: "0.88rem", lineHeight: 1.45 }}>
        Your device clock is different from the network&apos;s time, so the network
        rejected the request. Turn on automatic date &amp; time in your device
        settings, then retry.
      </p>
      <div style={{ display: "flex", gap: "0.55rem" }}>
        <button type="button" className="ice-btn ice-btn-xs" onClick={retry} disabled={busy}>
          {busy ? "Retrying…" : "Retry Connection"}
        </button>
        <button type="button" className="ice-btn ice-btn-xs" onClick={() => setVisible(false)}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
