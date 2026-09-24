import React, { useState } from "react";

export default function ReportButton({ actor, postId }) {
  const [status, setStatus] = useState(""); // "", "loading", "done", "error"
  const [message, setMessage] = useState("");

  const handleReport = async () => {
    if (!actor || status === "loading" || status === "done") return;

    const confirmed = window.confirm(
      "Report this post?\n\nIf enough people report it, the post will be hidden."
    );
    if (!confirmed) return;

    setStatus("loading");
    setMessage("");

    try {
      const result = await actor.reportPost(postId);
      setMessage(result);
      setStatus("done");
    } catch (err) {
      console.error(err);
      setMessage("Failed to report.");
      setStatus("error");
    }
  };

  return (
    <div style={{ display: "inline-block" }}>
      <button
        onClick={handleReport}
        disabled={status === "loading" || status === "done"}
        style={{
          background: "none",
          border: "1px solid rgba(148, 163, 184, 0.22)",
          borderRadius: "6px",
          padding: "0.2rem 0.6rem",
          fontSize: "0.8rem",
          color: status === "done" ? "#475569" : "#f87171",
          cursor: status === "loading" || status === "done" ? "default" : "pointer",
        }}
      >
        {status === "loading" ? "Reporting…" : status === "done" ? "Reported" : "Report"}
      </button>

      {message && (
        <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "#94a3b8" }}>
          {message}
        </span>
      )}
    </div>
  );
}
