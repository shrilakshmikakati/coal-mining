import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import { getAlerts, resolveAlert, raiseManualAlert, getShipments, ALERT_SEVERITY_COLORS } from "../utils/api";

const SEVERITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const SEV_BADGE = { Low: "active", Medium: "pending", High: "suspended", Critical: "revoked" };

const REASON_LABELS = {
  SHORTAGE_DETECTED: "Cargo Shortage",
  EXCESS_DETECTED: "Cargo Excess",
  DELIVERY_DISCREPANCY: "Delivery Discrepancy",
  MANUAL: "Manual Report",
};

function ManualAlertModal({ onClose, onCreated }) {
  const [shipments, setShipments] = useState([]);
  const [form, setForm] = useState({ shipmentId: "", severity: "High", reason: "MANUAL", notes: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    getShipments({ limit: 100 }).then(r => setShipments(r.data.data.filter(s => !["Delivered", "Seized"].includes(s.status))));
  }, []);

  const submit = async () => {
    if (!form.shipmentId || !form.severity) return setError("Select a shipment and severity");
    setLoading(true); setError("");
    try {
      await raiseManualAlert(form);
      onCreated(); onClose();
    } catch (e) { setError(e.response?.data?.error || "Failed to raise alert"); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Raise Manual Alert</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">⚠ {error}</div>}
          <div className="alert" style={{ background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.2)", color: "var(--rose)", padding: "12px 16px", borderRadius: 5, marginBottom: 16, fontSize: 13 }}>
            ⚠ Critical alerts will automatically SEIZE the shipment on blockchain
          </div>
          <div className="form-group">
            <label className="form-label">Shipment *</label>
            <select className="form-select" value={form.shipmentId} onChange={e => set("shipmentId", e.target.value)}>
              <option value="">Select active shipment...</option>
              {shipments.map(s => (
                <option key={s._id} value={s._id}>
                  #{s.blockchainId} — {s.truckId?.plateNumber} → {s.destination}
                </option>
              ))}
            </select>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Severity *</label>
              <select className="form-select" value={form.severity} onChange={e => set("severity", e.target.value)}>
                {["Low", "Medium", "High", "Critical"].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Reason *</label>
              <select className="form-select" value={form.reason} onChange={e => set("reason", e.target.value)}>
                <option value="MANUAL">Manual Report</option>
                <option value="SHORTAGE_DETECTED">Cargo Shortage</option>
                <option value="ROUTE_DEVIATION">Route Deviation</option>
                <option value="UNAUTHORIZED_STOP">Unauthorized Stop</option>
                <option value="DOCUMENT_MISMATCH">Document Mismatch</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes / Evidence</label>
            <textarea className="form-textarea" value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Describe the incident, evidence, or suspicious activity..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={submit} disabled={loading} style={{ background: "rgba(244,63,94,0.15)", color: "var(--rose)", border: "1px solid rgba(244,63,94,0.4)" }}>
            {loading ? <><span className="spinner" /> Broadcasting...</> : "⚠ Raise Alert on Blockchain"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showManual, setShowManual] = useState(false);
  const [resolving, setResolving] = useState(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [filters, setFilters] = useState({ resolved: "false", severity: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...filters };
      if (params.resolved === "") delete params.resolved;
      const r = await getAlerts({ ...params, limit: 50 });
      const sorted = [...r.data.data].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4));
      setAlerts(sorted); setTotal(r.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const doResolve = async (alertId) => {
    try {
      await resolveAlert(alertId, resolveNotes);
      setResolving(null); setResolveNotes("");
      load();
    } catch (e) { console.error(e); }
  };

  const unresolvedCritical = alerts.filter(a => !a.resolved && a.severity === "Critical").length;
  const unresolvedHigh = alerts.filter(a => !a.resolved && a.severity === "High").length;

  return (
    <Layout title="Theft & Anomaly Alerts">
      {showManual && <ManualAlertModal onClose={() => setShowManual(false)} onCreated={load} />}

      {/* Summary banners */}
      {unresolvedCritical > 0 && (
        <div className="alert alert-error" style={{ marginBottom: 16, fontSize: 14, fontWeight: 600 }}>
          🚨 {unresolvedCritical} CRITICAL alert{unresolvedCritical > 1 ? "s" : ""} require immediate action — shipment{unresolvedCritical > 1 ? "s have" : " has"} been SEIZED on blockchain
        </div>
      )}
      {unresolvedHigh > 0 && !unresolvedCritical && (
        <div className="alert" style={{ background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", color: "#f97316", marginBottom: 16 }}>
          ⚠ {unresolvedHigh} HIGH severity alert{unresolvedHigh > 1 ? "s" : ""} pending investigation
        </div>
      )}

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-danger" onClick={() => setShowManual(true)} style={{ background: "rgba(244,63,94,0.15)", color: "var(--rose)", border: "1px solid rgba(244,63,94,0.4)" }}>
          + Raise Manual Alert
        </button>
        <select className="form-select" style={{ width: 160 }} value={filters.resolved} onChange={e => setFilters(f => ({ ...f, resolved: e.target.value }))}>
          <option value="false">Unresolved</option>
          <option value="true">Resolved</option>
          <option value="">All</option>
        </select>
        <select className="form-select" style={{ width: 140 }} value={filters.severity} onChange={e => setFilters(f => ({ ...f, severity: e.target.value }))}>
          <option value="">All Severities</option>
          {["Critical", "High", "Medium", "Low"].map(s => <option key={s}>{s}</option>)}
        </select>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>{total} alerts</div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}><div className="spinner" /></div>
        ) : alerts.length === 0 ? (
          <div className="empty-state">
            <h3 style={{ color: "var(--emerald)" }}>No Active Alerts</h3>
            <p>All shipments are operating within authorized parameters</p>
          </div>
        ) : (
          <div>
            {alerts.map(a => {
              const shipment = a.shipmentId;
              const truck = shipment?.truckId;
              const company = shipment?.concessionId;
              const isResolving = resolving === a._id;
              return (
                <div key={a._id} style={{
                  borderLeft: `3px solid ${ALERT_SEVERITY_COLORS[a.severity]}`,
                  background: a.resolved ? "var(--ore)" : "rgba(244,63,94,0.04)",
                  borderRadius: "0 6px 6px 0",
                  padding: "16px 20px",
                  marginBottom: 12,
                  opacity: a.resolved ? 0.6 : 1,
                  border: `1px solid var(--seam)`,
                  borderLeftWidth: 3,
                  borderLeftColor: ALERT_SEVERITY_COLORS[a.severity],
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                        <span className={`badge badge-${SEV_BADGE[a.severity]}`} style={{ fontSize: 11 }}>{a.severity}</span>
                        <code style={{ fontSize: 12, color: "var(--amber)", fontFamily: "Space Mono" }}>
                          {REASON_LABELS[a.reason] || a.reason}
                        </code>
                        {a.resolved && <span className="badge badge-active" style={{ fontSize: 9 }}>RESOLVED</span>}
                      </div>
                      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
                        {truck && (
                          <div>
                            <span style={{ color: "var(--muted)", fontSize: 11 }}>TRUCK </span>
                            <strong style={{ fontFamily: "Space Mono", color: "var(--text)" }}>{truck.plateNumber}</strong>
                            <span style={{ color: "var(--muted)", marginLeft: 6, fontSize: 12 }}>{truck.driverName}</span>
                          </div>
                        )}
                        {company && (
                          <div>
                            <span style={{ color: "var(--muted)", fontSize: 11 }}>COMPANY </span>
                            <strong style={{ color: "var(--text)" }}>{company.companyName}</strong>
                          </div>
                        )}
                        {shipment && (
                          <div>
                            <span style={{ color: "var(--muted)", fontSize: 11 }}>ROUTE </span>
                            <span style={{ color: "var(--dim)" }}>{shipment.origin} → {shipment.destination}</span>
                          </div>
                        )}
                      </div>
                      {(a.expectedTons > 0 || a.reportedTons > 0) && (
                        <div style={{ marginTop: 8, fontSize: 12 }}>
                          <span style={{ color: "var(--muted)" }}>Expected: </span>
                          <span style={{ fontFamily: "Space Mono", color: "var(--emerald)" }}>{a.expectedTons}t</span>
                          <span style={{ margin: "0 8px", color: "var(--muted)" }}>→</span>
                          <span style={{ color: "var(--muted)" }}>Reported: </span>
                          <span style={{ fontFamily: "Space Mono", color: a.reportedTons < a.expectedTons ? "var(--rose)" : "var(--sky)" }}>
                            {a.reportedTons}t
                          </span>
                          {a.reportedTons > 0 && a.expectedTons > 0 && (
                            <span style={{ marginLeft: 8, color: "var(--rose)", fontWeight: 700 }}>
                              ({a.reportedTons < a.expectedTons ? "-" : "+"}{Math.abs(a.expectedTons - a.reportedTons)}t)
                            </span>
                          )}
                        </div>
                      )}
                      {a.notes && <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>{a.notes}</div>}
                      <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
                        Raised: {new Date(a.createdAt).toLocaleString()}
                        {a.resolved && a.resolvedAt && ` · Resolved: ${new Date(a.resolvedAt).toLocaleString()}`}
                      </div>
                    </div>

                    {!a.resolved && (
                      <div style={{ flexShrink: 0 }}>
                        {isResolving ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 220 }}>
                            <input className="form-input" placeholder="Resolution notes..." value={resolveNotes}
                              onChange={e => setResolveNotes(e.target.value)} style={{ fontSize: 12 }} />
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => doResolve(a._id)}>Confirm</button>
                              <button className="btn btn-secondary btn-sm" onClick={() => setResolving(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button className="btn btn-secondary btn-sm" onClick={() => setResolving(a._id)}>
                            ✓ Resolve
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
