import React, { useCallback, useEffect, useState } from "react";
import { createFactoryActor } from "./actors";
import { formatIcp } from "./icpLedger";

/**
 * Owner-controlled auto cycle top-up (factory-mediated).
 * Never drains factory; charges owner ICP via ICRC-2 when triggered.
 */
export default function SiteAutoTopUp({ identity, linked }) {
  const [enabled, setEnabled] = useState(false);
  const [maxIcp, setMaxIcp] = useState("0.5");
  const [maxPerDay, setMaxPerDay] = useState("2");
  const [status, setStatus] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    if (!identity) return;
    try {
      const factory = await createFactoryActor(identity);
      if (factory.getAutoTopUpStatus) {
        const me = identity.getPrincipal();
        const st = await factory.getAutoTopUpStatus(me);
        const rec = Array.isArray(st) ? st[0] : st;
        setStatus(rec || null);
        if (rec) {
          setEnabled(!!rec.enabled);
          if (rec.maxIcpE8sPerTopUp != null) {
            setMaxIcp((Number(rec.maxIcpE8sPerTopUp) / 1e8).toFixed(2));
          }
          if (rec.maxTopUpsPerDay != null) {
            setMaxPerDay(String(Number(rec.maxTopUpsPerDay)));
          }
        }
      }
      if (factory.getOwnerCycleAlerts) {
        const list = await factory.getOwnerCycleAlerts(10n);
        setAlerts(Array.isArray(list) ? list : []);
      }
    } catch (e) {
      console.warn(e);
    }
  }, [identity]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!identity) return;
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const factory = await createFactoryActor(identity);
      if (!factory.setAutoTopUp) {
        setErr("Auto top-up not available on this factory version.");
        return;
      }
      const e8s = BigInt(Math.round(parseFloat(maxIcp || "0") * 1e8));
      const day = BigInt(Math.max(1, parseInt(maxPerDay || "1", 10)));
      const result = await factory.setAutoTopUp(enabled, e8s, day);
      if (result && "ok" in result) {
        setMsg(result.ok);
        await load();
      } else {
        setErr((result && result.err) || "Save failed");
      }
    } catch (e) {
      setErr(e?.message || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const tryNow = async () => {
    if (!identity) return;
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      const factory = await createFactoryActor(identity);
      const result = await factory.tryAutoTopUpMySite();
      if (result && "ok" in result) {
        setMsg(result.ok);
        await load();
      } else {
        setErr((result && result.err) || "Top-up attempt failed");
      }
    } catch (e) {
      setErr(e?.message || "Top-up attempt failed");
    } finally {
      setBusy(false);
    }
  };

  if (!linked) {
    return (
      <div className="ice-panel">
        <h3 className="ice-panel-title">Auto cycle top-up</h3>
        <p className="ice-panel-desc" style={{ marginTop: "0.35rem" }}>
          Available when your site is linked to the network.
        </p>
      </div>
    );
  }

  return (
    <div className="ice-panel">
      <div className="ice-panel-head">
        <div>
          <h3 className="ice-panel-title">Auto cycle top-up</h3>
          <p className="ice-panel-desc">
            When cycles fall under ~2 T, the factory can deposit 1 T using{" "}
            <strong style={{ color: "#e2e8f0" }}>your ICP</strong> (approve first). Factory never
            spends its own reserve.
          </p>
        </div>
      </div>
      <label className="ice-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={busy}
        />
        Enable auto top-up
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div className="ice-field" style={{ marginBottom: 0, minWidth: 120 }}>
          <label htmlFor="ice-max-icp">Max ICP / top-up</label>
          <input
            id="ice-max-icp"
            className="ice-input"
            type="number"
            step="0.1"
            min="0.1"
            max="5"
            value={maxIcp}
            onChange={(e) => setMaxIcp(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="ice-field" style={{ marginBottom: 0, minWidth: 100 }}>
          <label htmlFor="ice-max-day">Max / day</label>
          <input
            id="ice-max-day"
            className="ice-input"
            type="number"
            min="1"
            max="3"
            value={maxPerDay}
            onChange={(e) => setMaxPerDay(e.target.value)}
            disabled={busy}
          />
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button type="button" className="ice-btn-primary" disabled={busy} onClick={save}>
          {busy ? "…" : "Save settings"}
        </button>
        <button type="button" className="ice-btn" disabled={busy || !enabled} onClick={tryNow}>
          Try top-up now
        </button>
      </div>
      {status?.enabled && (
        <p style={{ margin: "0.5rem 0 0", color: "#64748b", fontSize: "0.72rem" }}>
          Today: {String(status.topUpsToday ?? 0)} top-ups · cap{" "}
          {formatIcp(status.maxIcpE8sPerTopUp ?? 0)} ICP each
        </p>
      )}
      {alerts.length > 0 && (
        <div style={{ marginTop: "0.65rem" }}>
          <div style={{ color: "#fbbf24", fontSize: "0.75rem", fontWeight: 600 }}>Recent alerts</div>
          <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.1rem", color: "#94a3b8", fontSize: "0.72rem" }}>
            {alerts.slice(0, 5).map((a, i) => (
              <li key={i}>
                [{a.kind}] {a.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {msg && <p className="ice-inline-ok" style={{ marginTop: "0.5rem" }}>{msg}</p>}
      {err && <p className="ice-inline-err" style={{ marginTop: "0.5rem" }}>{err}</p>}
    </div>
  );
}
