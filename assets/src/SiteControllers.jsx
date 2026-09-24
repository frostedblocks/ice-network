import React, { useState, useEffect, useCallback } from "react";
import {
  setSiteControllers,
  standardControllerList,
  NNS_CONTROLLER,
  DFX_CONTROLLER,
  FACTORY_CONTROLLER,
  CONTROLLER_ROLE_HELP,
} from "./canisterControllers";
import { createFactoryActor } from "./actors";

/**
 * Controllers for personal site — minimal production set (T8 blast radius).
 * Factory is always retained. DFX ops is opt-in.
 */
export default function SiteControllers({ identity, siteId }) {
  const [nnsPrincipal, setNnsPrincipal] = useState(NNS_CONTROLLER);
  const [includeDfx, setIncludeDfx] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [controllers, setControllers] = useState(null);
  const [policyNote, setPolicyNote] = useState("");

  const me = identity?.getPrincipal?.()?.toText?.() || "";

  const planned = standardControllerList(me, nnsPrincipal, includeDfx);

  const apply = useCallback(async () => {
    if (!identity || !siteId) return;
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      // Prefer factory-mediated path when available (owner/self)
      try {
        const factory = await createFactoryActor(identity);
        if (factory.applyStandardControllers && !includeDfx) {
          const r = await factory.applyStandardControllers(identity.getPrincipal());
          if (typeof r === "string" && /Controllers set/i.test(r)) {
            setControllers(planned);
            setMsg(r);
            return;
          }
          // fall through to direct IC update if not linked owner path
        }
        if (includeDfx && factory.applyStandardControllersWithOps) {
          const r = await factory.applyStandardControllersWithOps(identity.getPrincipal());
          if (typeof r === "string" && /Controllers set/i.test(r)) {
            setControllers(planned);
            setMsg(r + " (dfx ops included)");
            return;
          }
        }
      } catch (_) {
        /* use direct update_settings */
      }

      const list = await setSiteControllers(identity, siteId, planned);
      setControllers(list);
      setMsg(
        "Controllers updated. Factory is always kept. Prefer Factory APIs for destructive ops (reset)."
      );
    } catch (e) {
      console.error(e);
      setErr(
        e?.message ||
          "Failed to update controllers. You must be a current controller (the ICE login that owns this site)."
      );
    } finally {
      setBusy(false);
    }
  }, [identity, siteId, planned, includeDfx]);

  useEffect(() => {
    setControllers(planned);
  }, [siteId, me, nnsPrincipal, includeDfx]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!identity) return;
    (async () => {
      try {
        const factory = await createFactoryActor(identity);
        if (factory.getControllerPolicy) {
          const p = await factory.getControllerPolicy();
          if (p?.note) setPolicyNote(p.note);
        }
      } catch (_) {
        /* optional */
      }
    })();
  }, [identity]);

  if (!siteId) return null;

  const roleFor = (c) => {
    if (c === me) return " · you (ICE owner)";
    if (c === NNS_CONTROLLER) return " · NNS founder";
    if (c === FACTORY_CONTROLLER) return " · factory (required)";
    if (c === DFX_CONTROLLER) return " · dfx ops (optional)";
    if (c === nnsPrincipal && c !== NNS_CONTROLLER) return " · extra NNS principal";
    return "";
  };

  return (
    <div className="ice-panel">
      <div className="ice-panel-head">
        <div>
          <h3 className="ice-panel-title">Controllers</h3>
          <p className="ice-panel-desc">
            Who can manage this canister. Default: owner + NNS founder + dfx + factory. Factory is
            always kept for reset, upgrade, and relink.
          </p>
        </div>
      </div>

      <div className="ice-warn-banner">
        If upgrades fail on an older site: only the owner II can re-add factory{" "}
        <code style={{ color: "#cbd5e1" }}>{FACTORY_CONTROLLER}</code> via Apply below.
      </div>

      <div className="ice-role-legend">
        {CONTROLLER_ROLE_HELP.map((r) => (
          <div key={r.id}>
            <strong>{r.label}:</strong> {r.hint}
          </div>
        ))}
        {policyNote && (
          <div style={{ marginTop: "0.35rem", color: "#64748b" }}>{policyNote}</div>
        )}
      </div>

      <div className="ice-field">
        <label htmlFor="ice-nns-extra">Extra NNS principal (optional)</label>
        <input
          id="ice-nns-extra"
          className="ice-input ice-mono"
          value={nnsPrincipal}
          onChange={(e) => setNnsPrincipal(e.target.value.trim())}
          placeholder="e.g. gmtr2-… or your NNS II"
        />
      </div>

      <label className="ice-check">
        <input
          type="checkbox"
          checked={includeDfx}
          onChange={(e) => setIncludeDfx(e.target.checked)}
        />
        Include dfx ops principal
      </label>

      <div className="ice-controller-list">
        {(controllers || planned).map((c) => (
          <div
            key={c}
            className={`ice-controller-row${
              c === me ? " is-you" : c === FACTORY_CONTROLLER ? " is-factory" : ""
            }`}
          >
            {c}
            {roleFor(c)}
          </div>
        ))}
      </div>

      <button
        type="button"
        className="ice-btn-primary"
        disabled={busy || !identity}
        onClick={apply}
      >
        {busy ? "Updating…" : "Apply standard controllers"}
      </button>

      {msg && (
        <p style={{ color: "#4ade80", fontSize: "0.8rem", margin: "0.6rem 0 0" }}>{msg}</p>
      )}
      {err && (
        <p style={{ color: "#f87171", fontSize: "0.8rem", margin: "0.6rem 0 0" }}>{err}</p>
      )}
    </div>
  );
}
