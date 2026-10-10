import React, { useState } from "react";

const II_MANAGE_URL = "https://identity.ic0.app";

function keyFor(principalText) {
  return `passkey_backup_dismissed:${principalText}`;
}

/** Dismissible reminder to add a backup passkey / recovery method to the SAME Internet Identity. */
export default function BackupPasskeyPrompt({ identity }) {
  const principalText = (() => {
    try {
      return identity?.getPrincipal?.()?.toText?.() || "";
    } catch {
      return "";
    }
  })();

  const [dismissed, setDismissed] = useState(() => {
    try {
      return !!principalText && localStorage.getItem(keyFor(principalText)) === "1";
    } catch {
      return false;
    }
  });

  if (!principalText || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(keyFor(principalText), "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <div className="ice-u-notice" role="status">
      <div className="ice-u-notice-body">
        <p style={{ margin: 0 }}>
          <strong>Back up your sign-in.</strong> Add a second passkey or a recovery
          method to the same Internet Identity you just used. If you lose this
          device without one, you lose this account.
        </p>
        <p style={{ margin: "0.4rem 0 0", fontSize: "0.82rem", color: "#FBBF24" }}>
          Do not create a new identity — that would be a different, empty account.
        </p>
        <div style={{ marginTop: "0.55rem" }}>
          <a
            href={II_MANAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ice-btn ice-btn-xs"
            style={{ textDecoration: "none" }}
          >
            Add a backup in Internet Identity
          </a>
        </div>
      </div>
      <button type="button" className="ice-btn ice-btn-xs" onClick={dismiss}>
        Dismiss
      </button>
    </div>
  );
}
