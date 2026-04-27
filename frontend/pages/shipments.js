import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import {
  getShipments, getShipment, createShipment, addCheckpoint,
  confirmDelivery, getTrucks, getConcessions, raiseManualAlert, SHIPMENT_STATUS_COLORS
} from "../utils/api";

const SEVERITY_COLORS = { Low: "active", Medium: "pending", High: "suspended", Critical: "revoked" };

function DispatchModal({ onClose, onCreated }) {
  const [trucks, setTrucks] = useState([]);
  const [concessions, setConcessions] = useState([]);
  const [form, setForm] = useState({ concessionId: "", truckId: "", authorizedTons: "", origin: "", destination: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    Promise.all([
      getTrucks({ active: true, limit: 100 }),
      getConcessions({ status: "Active", limit: 100 }),
    ]).then(([t, c]) => { setTrucks(t.data.data.filter(x => x.blockchainId)); setConcessions(c.data.data.filter(x => x.blockchainId)); });
  }, []);

  const submit = async () => {
    if (!form.concessionId || !form.truckId || !form.authorizedTons || !form.origin || !form.destination)
      return setError("All fields are required");
    setLoading(true); setError("");
    try {
      const concession = concessions.find(c => c._id === form.concessionId);
      await createShipment({
        ...form,
        authorizedTons: +form.authorizedTons,
        concessionChainId: concession.blockchainId,
      });
      onCreated(); onClose();
    } catch (e) { setError(e.response?.data?.error || "Dispatch failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Dispatch Shipment</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">⚠ {error}</div>}
          <div className="alert alert-info">⬡ Seal hash generated automatically. Transaction recorded on Ganache.</div>
          <div className="form-group">
            <label className="form-label">Concession (Active, On-chain) *</label>
            <select className="form-select" value={form.concessionId} onChange={e => set("concessionId", e.target.value)}>
              <option value="">Select concession...</option>
              {concessions.map(c => <option key={c._id} value={c._id}>{c.companyName} — {c.location} (#{c.blockchainId})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Truck (Active, On-chain) *</label>
            <select className="form-select" value={form.truckId} onChange={e => set("truckId", e.target.value)}>
              <option value="">Select truck...</option>
              {trucks.map(t => <option key={t._id} value={t._id}>{t.plateNumber} — {t.driverName} ({t.capacity}t cap)</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Authorized Tons *</label>
            <input className="form-input" type="number" value={form.authorizedTons} onChange={e => set("authorizedTons", e.target.value)} placeholder="25" />
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Origin *</label>
              <input className="form-input" value={form.origin} onChange={e => set("origin", e.target.value)} placeholder="Dhanbad Mine, Jharkhand" />
            </div>
            <div className="form-group">
              <label className="form-label">Destination *</label>
              <input className="form-input" value={form.destination} onChange={e => set("destination", e.target.value)} placeholder="Bokaro Steel Plant" />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? <><span className="spinner" /> Broadcasting...</> : "⬖ Dispatch Shipment"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ShipmentDetail({ id, onClose, onRefresh }) {
  const [data, setData] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ location: "", reportedTons: "", notes: "" });
  const [finalTons, setFinalTons] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getShipment(id).then(r => { setData(r.data.data); setAlerts(r.data.alerts || []); }).finally(() => setLoading(false));
  }, [id]);

  const scan = async () => {
    if (!form.location || !form.reportedTons) return setMsg("Location and tons required");
    setActionLoading(true);
    try {
      const r = await addCheckpoint(id, { ...form, reportedTons: +form.reportedTons });
      setMsg(r.data.tonsMatch ? "✓ Checkpoint recorded — tons match" : "⚠ MISMATCH DETECTED — alert raised on blockchain");
      setForm({ location: "", reportedTons: "", notes: "" });
      const updated = await getShipment(id);
      setData(updated.data.data); setAlerts(updated.data.alerts || []);
    } catch (e) { setMsg("✗ " + (e.response?.data?.error || "Failed")); }
    finally { setActionLoading(false); }
  };

  const deliver = async () => {
    if (!finalTons) return setMsg("Enter final tons at delivery");
    setActionLoading(true);
    try {
      const r = await confirmDelivery(id, +finalTons);
      setMsg(r.data.discrepancy ? "⚠ DISCREPANCY — flagged on blockchain" : "✓ Delivery confirmed on chain");
      onRefresh();
      const updated = await getShipment(id);
      setData(updated.data.data); setAlerts(updated.data.alerts || []);
    } catch (e) { setMsg("✗ " + (e.response?.data?.error || "Failed")); }
    finally { setActionLoading(false); }
  };

  const s = data;
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 720 }}>
        <div className="modal-header">
          <span className="modal-title">Shipment #{s?.blockchainId || "..."}</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? <div style={{ display: "flex", justifyContent: "center", padding: 32 }}><div className="spinner" /></div> : (
            <>
              {msg && <div className={`alert ${msg.startsWith("✓") ? "alert-success" : "alert-error"}`}>{msg}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                {[
                  ["Truck", s.truckId?.plateNumber],
                  ["Driver", s.truckId?.driverName],
                  ["Authorized Tons", `${s.authorizedTons}t`],
                  ["Status", <span key="s" className={`badge badge-${SHIPMENT_STATUS_COLORS[s.status]}`}>{s.status}</span>],
                  ["Origin", s.origin],
                  ["Destination", s.destination],
                  ["Dispatched", new Date(s.dispatchedAt).toLocaleString()],
                  ["Seal Hash", <span key="h" className="hash">{s.sealHash?.slice(0, 20)}...</span>],
                ].map(([k, v]) => (
                  <div key={k} style={{ background: "var(--ore)", borderRadius: 5, padding: "10px 14px" }}>
                    <div className="detail-key" style={{ marginBottom: 4 }}>{k}</div>
                    <div style={{ color: "var(--text)", fontWeight: 600 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Checkpoints */}
              {s.checkpoints?.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div className="card-title" style={{ marginBottom: 12 }}>Checkpoint Log</div>
                  {s.checkpoints.map((cp, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--ore)" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text)" }}>{cp.location}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{new Date(cp.scannedAt).toLocaleString()}</div>
                        {cp.notes && <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", marginTop: 2 }}>{cp.notes}</div>}
                        {cp.coalQuality && (
                          <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                            {cp.coalQuality.grade && <span className="badge badge-active" style={{ fontSize: 9 }}>{cp.coalQuality.grade}</span>}
                            {cp.coalQuality.moisturePercent != null && <span style={{ fontSize: 10, color: "var(--muted)" }}>💧 {cp.coalQuality.moisturePercent}%</span>}
                            {cp.coalQuality.ashPercent != null && <span style={{ fontSize: 10, color: "var(--muted)" }}>🌫 {cp.coalQuality.ashPercent}%</span>}
                            {cp.coalQuality.calorificValue != null && <span style={{ fontSize: 10, color: "var(--muted)" }}>🔥 {cp.coalQuality.calorificValue} kcal</span>}
                          </div>
                        )}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "Space Mono", fontSize: 13 }}>{cp.reportedTons}t</div>
                        <span className={`badge badge-${cp.tonsMatch ? "active" : "revoked"}`} style={{ fontSize: 9 }}>
                          {cp.tonsMatch ? "MATCH" : "MISMATCH"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Alerts on this shipment */}
              {alerts.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div className="card-title" style={{ marginBottom: 12 }}>Theft Alerts on This Shipment</div>
                  {alerts.map(a => (
                    <div key={a._id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "rgba(244,63,94,0.08)", borderRadius: 5, marginBottom: 6, border: "1px solid rgba(244,63,94,0.2)" }}>
                      <div>
                        <span className={`badge badge-${SEVERITY_COLORS[a.severity]}`} style={{ marginRight: 8 }}>{a.severity}</span>
                        <code style={{ fontSize: 11 }}>{a.reason}</code>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{a.expectedTons}t expected / {a.reportedTons}t reported</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Checkpoint */}
              {["Dispatched", "InTransit"].includes(s.status) && (
                <div style={{ borderTop: "1px solid var(--seam)", paddingTop: 16, marginBottom: 16 }}>
                  <div className="card-title" style={{ marginBottom: 12 }}>Scan Checkpoint</div>
                  <div className="form-grid">
                    <div className="form-group">
                      <label className="form-label">Checkpoint Location</label>
                      <input className="form-input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Highway NH58, KM 42" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Measured Tons</label>
                      <input className="form-input" type="number" value={form.reportedTons} onChange={e => setForm(f => ({ ...f, reportedTons: e.target.value }))} placeholder="25" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <input className="form-input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Visual inspection, weigh bridge scan..." />
                  </div>
                  <button className="btn btn-primary" onClick={scan} disabled={actionLoading} style={{ width: "100%" }}>
                    {actionLoading ? <><span className="spinner" /> Submitting Tx...</> : "◉ Record Checkpoint on Blockchain"}
                  </button>
                </div>
              )}

              {/* Confirm Delivery */}
              {["Dispatched", "InTransit"].includes(s.status) && (
                <div style={{ borderTop: "1px solid var(--seam)", paddingTop: 16 }}>
                  <div className="card-title" style={{ marginBottom: 12 }}>Confirm Delivery</div>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                    <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                      <label className="form-label">Final Tons at Destination</label>
                      <input className="form-input" type="number" value={finalTons} onChange={e => setFinalTons(e.target.value)} placeholder="Weigh bridge reading at destination" />
                    </div>
                    <button className="btn btn-primary" onClick={deliver} disabled={actionLoading}>
                      {actionLoading ? <span className="spinner" /> : "✓ Confirm"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Shipments() {
  const [shipments, setShipments] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showDispatch, setShowDispatch] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getShipments({ status: statusFilter || undefined, limit: 30 });
      setShipments(r.data.data); setTotal(r.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const STATUSES = ["Dispatched", "InTransit", "Flagged", "Delivered", "Seized"];
  const SHIP_STATUS = { Dispatched: "pending", InTransit: "active", Flagged: "suspended", Delivered: "active", Seized: "revoked" };

  return (
    <Layout title="Coal Shipments">
      {showDispatch && <DispatchModal onClose={() => setShowDispatch(false)} onCreated={load} />}
      {selectedId && <ShipmentDetail id={selectedId} onClose={() => setSelectedId(null)} onRefresh={load} />}

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn btn-primary" onClick={() => setShowDispatch(true)}>+ Dispatch Shipment</button>
        <select className="form-select" style={{ width: 160 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>{total} shipments</div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}><div className="spinner" /></div>
        ) : shipments.length === 0 ? (
          <div className="empty-state">
            <h3>No Shipments Found</h3>
            <p>Dispatch a truck to start tracking coal movement</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Chain ID</th><th>Truck</th><th>Driver</th><th>Route</th>
                <th>Auth. Tons</th><th>Checkpoints</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {shipments.map(s => (
                  <tr key={s._id}>
                    <td>
                      {s.blockchainId
                        ? <span style={{ fontFamily: "Space Mono", color: "var(--amber)", fontWeight: 700 }}>#{s.blockchainId}</span>
                        : "—"}
                    </td>
                    <td><strong style={{ color: "var(--text)", fontFamily: "Space Mono" }}>{s.truckId?.plateNumber}</strong></td>
                    <td>{s.truckId?.driverName}</td>
                    <td>
                      <div style={{ fontSize: 12 }}><span style={{ color: "var(--emerald)" }}>↑</span> {s.origin}</div>
                      <div style={{ fontSize: 12 }}><span style={{ color: "var(--rose)" }}>↓</span> {s.destination}</div>
                    </td>
                    <td><span style={{ fontFamily: "Space Mono" }}>{s.authorizedTons}t</span></td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        {(s.checkpoints || []).slice(-3).map((cp, i) => (
                          <span key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: cp.tonsMatch ? "var(--emerald)" : "var(--rose)", display: "inline-block" }} title={cp.location} />
                        ))}
                        {s.checkpoints?.length > 0 && <span style={{ fontSize: 11, color: "var(--muted)" }}>{s.checkpoints.length}</span>}
                      </div>
                    </td>
                    <td><span className={`badge badge-${SHIP_STATUS[s.status] || "pending"}`}>{s.status}</span></td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setSelectedId(s._id)}>Details</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
