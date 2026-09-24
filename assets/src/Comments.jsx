import React, { useState, useEffect } from "react";
import Username from "./Username";

export default function Comments({ actor, postId, currentUserPrincipal }) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const [busyId, setBusyId] = useState(null);

  const MAX_LENGTH = 2000;

  const loadComments = async () => {
    if (!actor) return;
    setLoading(true);
    setError("");
    try {
      const result = await actor.getComments(postId);
      setComments(result);
    } catch (err) {
      console.error(err);
      setError("Could not load comments.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [actor, postId]);

  const isMine = (c) =>
    currentUserPrincipal &&
    c.author &&
    currentUserPrincipal.toString() === c.author.toString();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || !actor) return;

    setSubmitting(true);
    setError("");

    try {
      const result = await actor.addComment(postId, newComment.trim());
      if (result && result.length > 0) {
        setNewComment("");
        await loadComments();
      } else {
        setError("Could not add comment.");
      }
    } catch (err) {
      console.error(err);
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (commentId) => {
    if (!actor || !editDraft.trim()) return;
    setBusyId(commentId.toString());
    setError("");
    try {
      const result = await actor.editComment(commentId, editDraft.trim());
      const text = typeof result === "string" ? result : "";
      if (/updated/i.test(text)) {
        setEditingId(null);
        setEditDraft("");
        await loadComments();
      } else {
        setError(text || "Edit failed");
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Edit failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (commentId) => {
    if (!actor) return;
    if (!window.confirm("Delete this comment?")) return;
    setBusyId(commentId.toString());
    setError("");
    try {
      const result = await actor.deleteComment(commentId);
      const text = typeof result === "string" ? result : "";
      if (/deleted/i.test(text)) {
        setComments((prev) => prev.filter((c) => c.id.toString() !== commentId.toString()));
        if (editingId && editingId.toString() === commentId.toString()) {
          setEditingId(null);
          setEditDraft("");
        }
      } else {
        setError(text || "Delete failed");
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Delete failed");
    } finally {
      setBusyId(null);
    }
  };

  const remaining = MAX_LENGTH - newComment.length;
  const counterColor = remaining < 50 ? "#f87171" : remaining < 200 ? "#fbbf24" : "#64748b";

  return (
    <div style={{ marginTop: "1rem", borderTop: "1px solid rgba(148, 163, 184, 0.14)", paddingTop: "0.85rem" }}>
      <h4 style={{ margin: "0 0 0.75rem 0", fontSize: "0.9rem", color: "#94a3b8" }}>Comments</h4>

      {loading ? (
        <p style={{ fontSize: "0.85rem", color: "#64748b" }}>Loading comments…</p>
      ) : comments.length === 0 ? (
        <p style={{ fontSize: "0.85rem", color: "#475569" }}>No comments yet.</p>
      ) : (
        <div style={{ marginBottom: "1rem" }}>
          {comments.map((c) => {
            const mine = isMine(c);
            const isEditing = editingId !== null && editingId.toString() === c.id.toString();
            const busy = busyId === c.id.toString();

            return (
              <div
                key={c.id.toString()}
                style={{
                  marginBottom: "0.55rem",
                  padding: "0.55rem 0.7rem",
                  background: "rgba(9, 9, 11, 0.72)",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  border: "1px solid rgba(148, 163, 184, 0.14)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                    <Username actor={actor} principal={c.author} />
                  </div>
                  {mine && !isEditing && (
                    <div style={{ display: "flex", gap: "0.35rem" }}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(c.id);
                          setEditDraft(c.content || "");
                          setError("");
                        }}
                        style={subtleBtn}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleDelete(c.id)}
                        style={{ ...subtleBtn, color: "#fca5a5", borderColor: "#7f1d1d" }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div>
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={2}
                      maxLength={MAX_LENGTH}
                      style={{
                        width: "100%",
                        boxSizing: "border-box",
                        padding: "0.45rem",
                        fontSize: "0.9rem",
                        background: "rgba(18, 20, 32, 0.55)",
                        color: "#e2e8f0",
                        border: "1px solid rgba(148, 163, 184, 0.22)",
                        borderRadius: "6px",
                        fontFamily: "inherit",
                      }}
                    />
                    <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.4rem" }}>
                      <button
                        type="button"
                        disabled={busy || !editDraft.trim()}
                        onClick={() => handleSaveEdit(c.id)}
                        style={{
                          ...subtleBtn,
                          background: "linear-gradient(135deg, #38bdf8 0%, #818cf8 50%, #a78bfa 100%)",
                          borderColor: "transparent",
                          color: "#0f172a",
                          fontWeight: 600,
                        }}
                      >
                        {busy ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(null);
                          setEditDraft("");
                        }}
                        style={subtleBtn}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ whiteSpace: "pre-wrap", color: "#e2e8f0" }}>{c.content}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Write a comment…"
          rows={2}
          maxLength={MAX_LENGTH}
          style={{
            width: "100%",
            padding: "0.5rem",
            fontSize: "0.9rem",
            background: "rgba(9, 9, 11, 0.72)",
            color: "#e2e8f0",
            border: "1px solid rgba(148, 163, 184, 0.22)",
            borderRadius: "8px",
          }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.4rem" }}>
          <span style={{ fontSize: "0.8rem", color: counterColor }}>
            {newComment.length} / {MAX_LENGTH}
          </span>
          <button
            type="submit"
            disabled={submitting || !newComment.trim()}
            style={{
              background: "rgba(148, 163, 184, 0.14)",
              color: "#e2e8f0",
              border: "1px solid rgba(148, 163, 184, 0.22)",
              borderRadius: "6px",
              padding: "0.3rem 0.8rem",
              cursor: "pointer",
            }}
          >
            {submitting ? "Posting…" : "Add Comment"}
          </button>
        </div>
      </form>

      {error && <p style={{ color: "#f87171", fontSize: "0.85rem" }}>{error}</p>}
    </div>
  );
}

const subtleBtn = {
  background: "transparent",
  color: "#94a3b8",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: "6px",
  padding: "0.15rem 0.45rem",
  fontSize: "0.7rem",
  cursor: "pointer",
};
