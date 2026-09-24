import React, { useCallback, useEffect, useMemo, useState } from "react";
import { unwrapOpt } from "./candidUtils";
import { DEFAULT_CATEGORY } from "./categories";

const STORAGE_PREFIX = "ice-first-login-v1:";

function principalKey(principal) {
  try {
    return (principal?.toText?.() || String(principal || "")).trim();
  } catch {
    return "";
  }
}

function defaultProgress() {
  return {
    enrolled: false,
    username: false,
    post: false,
    completedAt: null,
  };
}

export function loadFirstLoginProgress(principal) {
  const key = principalKey(principal);
  if (!key) return defaultProgress();
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw);
    return { ...defaultProgress(), ...parsed };
  } catch {
    return defaultProgress();
  }
}

export function saveFirstLoginProgress(principal, progress) {
  const key = principalKey(principal);
  if (!key) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(progress));
  } catch {
    /* ignore quota */
  }
}

/** Call right after successful Join so only new accounts see the checklist. */
export function enrollFirstLogin(principal, { usernameDone = true } = {}) {
  const prev = loadFirstLoginProgress(principal);
  if (prev.completedAt) return prev;
  const next = {
    ...prev,
    enrolled: true,
    username: prev.username || !!usernameDone,
  };
  saveFirstLoginProgress(principal, next);
  return next;
}

/** True when this principal was enrolled and has not finished the checklist. */
export function isFirstLoginIncomplete(principal) {
  const p = loadFirstLoginProgress(principal);
  return !!p.enrolled && !p.completedAt;
}

/**
 * Post-account modal: confirm username, then first post.
 * Skip for now hides for this session; incomplete state resumes next visit.
 * Only enrolled principals (after Join) see this — existing users are left alone.
 */
export default function FirstLoginChecklist({
  actor,
  identity,
  enabled = true,
  onFeedRefresh,
  onGoHome,
}) {
  const me = identity?.getPrincipal?.() || null;
  const meText = principalKey(me);

  const [progress, setProgress] = useState(() => loadFirstLoginProgress(me));
  const [sessionSkipped, setSessionSkipped] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [booting, setBooting] = useState(true);
  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [username, setUsername] = useState("");
  const [postText, setPostText] = useState("");

  const enrolled = !!progress.enrolled;
  const completed = !!progress.completedAt;

  const persist = useCallback(
    (next) => {
      setProgress(next);
      saveFirstLoginProgress(me, next);
    },
    [me]
  );

  const markComplete = useCallback(
    (patch) => {
      setProgress((prev) => {
        const next = { ...prev, ...patch };
        const allDone = !!(next.username && next.post);
        if (allDone) {
          next.completedAt = new Date().toISOString();
          setForceOpen(false);
        }
        saveFirstLoginProgress(me, next);
        return next;
      });
    },
    [me]
  );

  const syncFromNetwork = useCallback(async () => {
    if (!actor || !me) {
      setBooting(false);
      return;
    }
    setBooting(true);
    setError("");
    try {
      const profRaw = actor.getProfile ? await actor.getProfile(me) : null;

      const prof = unwrapOpt(profRaw);
      const name = (prof?.username || "").trim();
      if (name) setUsername(name);

      let hasPosted = false;
      try {
        if (actor.getUserStats) {
          const statsRaw = await actor.getUserStats(me);
          const stats = unwrapOpt(statsRaw);
          // Best available signal on UserStats (no lifetime post count in candid)
          hasPosted = Number(stats?.postsToday ?? 0) > 0;
        }
      } catch (_) {
        /* optional */
      }

      const base = loadFirstLoginProgress(me);
      if (!base.enrolled) {
        setBooting(false);
        return;
      }
      const next = {
        ...base,
        enrolled: true,
        username: base.username || !!name,
        post: base.post || hasPosted,
      };
      if (next.username && next.post && !next.completedAt) {
        next.completedAt = new Date().toISOString();
      }
      persist(next);

      if (!next.username) setActiveStep(0);
      else if (!next.post) setActiveStep(1);
      else setActiveStep(0);
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not load setup status.");
    } finally {
      setBooting(false);
    }
  }, [actor, me, persist]);

  useEffect(() => {
    setProgress(loadFirstLoginProgress(me));
    setSessionSkipped(false);
    setForceOpen(false);
  }, [meText]);

  useEffect(() => {
    if (!enabled || !actor || !me || completed || !enrolled) {
      setBooting(false);
      return;
    }
    syncFromNetwork();
  }, [enabled, actor, meText, completed, enrolled, syncFromNetwork]);

  const stepsDone = useMemo(() => {
    let n = 0;
    if (progress.username) n += 1;
    if (progress.post) n += 1;
    return n;
  }, [progress]);

  const showModal =
    enabled &&
    !!me &&
    enrolled &&
    !completed &&
    !booting &&
    (!sessionSkipped || forceOpen);

  const showChip =
    enabled &&
    !!me &&
    enrolled &&
    !completed &&
    !booting &&
    sessionSkipped &&
    !forceOpen;

  const saveUsername = async (e) => {
    e?.preventDefault?.();
    if (!actor || busy) return;
    const name = username.trim();
    if (!name) {
      setError("Choose a username to continue.");
      return;
    }
    if (name.length > 50) {
      setError("Username must be 50 characters or less.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await actor.setProfile(name, "", "");
      const text = typeof result === "string" ? result : "Profile saved";
      if (/saved|success/i.test(text) || result === undefined) {
        markComplete({ username: true });
        setActiveStep(1);
      } else {
        setError(text || "Could not save username.");
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Could not save username.");
    } finally {
      setBusy(false);
    }
  };

  const submitFirstPost = async (e) => {
    e?.preventDefault?.();
    if (!actor || busy) return;
    const content = postText.trim();
    if (!content) {
      setError("Write a short first post to continue.");
      return;
    }
    if (content.length > 512) {
      setError("Keep your first post under 512 characters.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await actor.makePost(content, [], DEFAULT_CATEGORY);
      const postId = unwrapOpt(result);
      if (postId === null || postId === undefined) {
        setError("Could not post. Check your daily limit, or try again.");
      } else {
        setPostText("");
        markComplete({ post: true });
        if (typeof onFeedRefresh === "function") onFeedRefresh();
        if (typeof onGoHome === "function") onGoHome();
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Something went wrong while posting.");
    } finally {
      setBusy(false);
    }
  };

  const skipForNow = () => {
    setSessionSkipped(true);
    setForceOpen(false);
    setError("");
  };

  if (!enabled || !me || !enrolled) return null;

  return (
    <>
      {showChip && (
        <button
          type="button"
          className="ice-setup-chip"
          onClick={() => {
            setForceOpen(true);
            if (typeof onGoHome === "function") onGoHome();
          }}
        >
          Finish setup ({stepsDone}/2)
        </button>
      )}

      {showModal && (
        <div className="ice-setup-backdrop" role="presentation" onClick={skipForNow}>
          <div
            className="ice-setup-modal ice-glass"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ice-setup-title"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="ice-setup-kicker">Welcome</p>
            <h2 id="ice-setup-title" className="ice-setup-title">
              You’re in — two quick steps
            </h2>
            <p className="ice-setup-sub">
              About a minute. You can skip and finish later.
            </p>

            <ol className="ice-setup-steps" aria-label="Setup progress">
              {[
                { id: "username", label: "Confirm your name", done: progress.username },
                { id: "post", label: "Share your first post", done: progress.post },
              ].map((s, i) => (
                <li key={s.id} className={s.done ? "is-done" : i === activeStep ? "is-active" : ""}>
                  <button type="button" onClick={() => setActiveStep(i)}>
                    <span className="ice-setup-step-num" aria-hidden="true">
                      {s.done ? "✓" : i + 1}
                    </span>
                    {s.label}
                  </button>
                </li>
              ))}
            </ol>

            {error && <div className="ice-alert-error ice-setup-error">{error}</div>}

            <div className="ice-setup-body">
              {activeStep === 0 && (
                <form onSubmit={saveUsername}>
                  <label className="ice-setup-label" htmlFor="ice-setup-username">
                    Username
                  </label>
                  {progress.username ? (
                    <p className="ice-setup-done-msg">
                      You’re set as <strong>{username || "your name"}</strong>.
                    </p>
                  ) : (
                    <>
                      <input
                        id="ice-setup-username"
                        className="ice-setup-input"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        maxLength={50}
                        placeholder="Choose a username"
                        autoComplete="username"
                        disabled={busy}
                      />
                      <button type="submit" className="ice-btn-primary" disabled={busy}>
                        {busy ? "Saving…" : "Save name"}
                      </button>
                    </>
                  )}
                  {progress.username && (
                    <button
                      type="button"
                      className="ice-btn-primary"
                      onClick={() => setActiveStep(1)}
                    >
                      Continue
                    </button>
                  )}
                </form>
              )}

              {activeStep === 1 && (
                <form onSubmit={submitFirstPost}>
                  {progress.post ? (
                    <p className="ice-setup-done-msg">Your first post is live. You’re done.</p>
                  ) : (
                    <>
                      <label className="ice-setup-label" htmlFor="ice-setup-post">
                        First post
                      </label>
                      <textarea
                        id="ice-setup-post"
                        className="ice-setup-textarea"
                        rows={3}
                        maxLength={512}
                        value={postText}
                        onChange={(e) => setPostText(e.target.value)}
                        placeholder="Say hello — keep it short."
                        disabled={busy}
                      />
                      <button type="submit" className="ice-btn-primary" disabled={busy}>
                        {busy ? "Posting…" : "Post"}
                      </button>
                    </>
                  )}
                </form>
              )}
            </div>

            <div className="ice-setup-footer">
              <span className="ice-setup-progress">
                {stepsDone}/2 complete
              </span>
              {!completed && (
                <button type="button" className="ice-btn" onClick={skipForNow}>
                  Skip for now
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
