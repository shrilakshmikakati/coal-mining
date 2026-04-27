import { useState, useEffect, useRef, useCallback } from "react";
import Layout from "../components/Layout";
import { getShipments, getShipment, depotScan, getDepots, createDepot } from "../utils/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const STATUS_COLOR = {
  Dispatched: "var(--amber)", InTransit: "var(--sky)",
  Flagged: "#f97316", Delivered: "var(--emerald)", Seized: "var(--rose)",
};

// Simple canvas-based map renderer — no external map API needed
function TrailMap({ trail, checkpoints, origin, destination }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || trail.length === 0) return;
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const lats = trail.map(p => p.lat);
    const lngs = trail.map(p => p.lng);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const pad = 40;

    const toX = lng => pad + ((lng - minLng) / (maxLng - minLng || 1)) * (W - pad * 2);
    const toY = lat => H - pad - ((lat - minLat) / (maxLat - minLat || 1)) * (H - pad * 2);

    // Grid
    ctx.strokeStyle = "#252530";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      ctx.beginPath(); ctx.moveTo(pad + i * (W - pad * 2) / 5, pad);
      ctx.lineTo(pad + i * (W - pad * 2) / 5, H - pad); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, pad + i * (H - pad * 2) / 5);
      ctx.lineTo(W - pad, pad + i * (H - pad * 2) / 5); ctx.stroke();
    }

    // Trail
    ctx.beginPath();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 2;
    trail.forEach((p, i) => {
      i === 0 ? ctx.moveTo(toX(p.lng), toY(p.lat)) : ctx.lineTo(toX(p.lng), toY(p.lat));
    });
    ctx.stroke();

    // Trail dots (speed color)
    trail.forEach(p => {
      const color = p.speedKmh > 80 ? "#f43f5e" : p.speedKmh > 40 ? "#f59e0b" : "#38bdf8";
      ctx.beginPath();
      ctx.arc(toX(p.lng), toY(p.lat), 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });

    // Checkpoint markers
    checkpoints.forEach(cp => {
      if (!cp.lat && !cp.lng) return;
      const x = toX(cp.lng), y = toY(cp.lat);
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = cp.tonsMatch ? "rgba(16,185,129,0.3)" : "rgba(244,63,94,0.3)";
      ctx.fill();
      ctx.strokeStyle = cp.tonsMatch ? "#10b981" : "#f43f5e";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Current position
    const last = trail[trail.length - 1];
    ctx.beginPath();
    ctx.arc(toX(last.lng), toY(last.lat), 8, 0, Math.PI * 2);
    ctx.fillStyle = "#f59e0b";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Labels
    ctx.font = "11px Space Mono, monospace";
    ctx.fillStyle = "#6b7280";
    ctx.fillText(`${minLat.toFixed(3)}°N`, 4, H - pad + 14);
    ctx.fillText(`${maxLat.toFixed(3)}°N`, 4, pad - 4);
  }, [trail, checkpoints]);

  if (trail.length === 0) {
    return (
      <div style={{ height: 260, background: "var(--ore)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 32, opacity: 0.2 }}>◉</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>Waiting for GPS pings...</div>
        <div style={{ fontSize: 11, color: "var(--muted)", opacity: 0.6 }}>POST /api/shipments/:id/ping with lat, lng</div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      <canvas ref={canvasRef} width={600} height={260}
        style={{ width: "100%", height: 260, background: "var(--ore)", borderRadius: 8, display: "block" }} />
      <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, fontSize: 10, fontFamily: "Space Mono" }}>
        {[["#38bdf8", "Trail"], ["#f59e0b", "Current"], ["#10b981", "Depot OK"], ["#f43f5e", "Alert"]].map(([c, l]) => (
          <span key={l} style={{ background: "rgba(0,0,0,0.6)", padding: "2px 8px", borderRadius: 3, color: c }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function DepotScanPanel({ shipment, depots, onScanned }) {
  const [form, setForm] = useState({ 
    depotId: "", measuredTons: "", notes: "",
    grade: "", moisturePercent: "", ashPercent: "", calorificValue: "" 
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [validatorState, setValidatorState] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.measuredTons) return;
    setLoading(true); setResult(null); setValidatorState("simulating");
    
    // Simulate validator network delay
    await new Promise(r => setTimeout(r, 1200));

    try {
      const r = await depotScan(shipment._id, {
        depotId: form.depotId || undefined,
        measuredTons: +form.measuredTons,
        notes: form.notes,
        depotName: form.depotId ? undefined : "Manual Scan",
        coalQuality: {
          grade: form.grade || undefined,
          moisturePercent: form.moisturePercent ? +form.moisturePercent : undefined,
          ashPercent: form.ashPercent ? +form.ashPercent : undefined,
          calorificValue: form.calorificValue ? +form.calorificValue : undefined,
        }
      });
      setValidatorState("success");
      setResult(r.data);
      setForm({ depotId: "", measuredTons: "", notes: "", grade: "", moisturePercent: "", ashPercent: "", calorificValue: "" });
      onScanned();
    } catch (e) {
      if (e.response?.data?.qualityTampered) {
        setValidatorState("failed");
      } else {
        setValidatorState(null);
      }
      setResult({ error: e.response?.data?.error || "Scan failed", isTampered: e.response?.data?.qualityTampered });
    }
    setLoading(false);
  };

  return (
    <div style={{ background: "var(--ore)", borderRadius: 8, padding: 20, border: "1px solid var(--seam)" }}>
      <div style={{ fontFamily: "Space Mono", fontSize: 11, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>
        ◈ Depot Weigh-Bridge Scan
      </div>

      {result && !result.error && (
        <div className={`alert ${result.tonsMatch ? "alert-success" : "alert-error"}`} style={{ marginBottom: 12, fontSize: 13 }}>
          {result.tonsMatch
            ? `✓ MATCH — ${form.measuredTons || result.data?.checkpoints?.slice(-1)[0]?.reportedTons}t verified. Tx: ${result.txHash?.slice(0, 14)}...`
            : `⚠ MISMATCH — Diff: ${result.diff > 0 ? "+" : ""}${result.diff?.toFixed(2)}t. Alert raised on blockchain.`}
        </div>
      )}
      {result?.error && (
        <div className="alert alert-error" style={{ marginBottom: 12, fontSize: 13, background: result.isTampered ? "rgba(244,63,94,0.15)" : undefined, borderColor: result.isTampered ? "var(--rose)" : undefined }}>
           {result.isTampered ? <strong>🛑 VALIDATOR REJECTION:<br/></strong> : "✗ "}{result.error}
        </div>
      )}

      {validatorState === "simulating" && (
         <div style={{ padding: 12, border: "1px solid var(--seam)", background: "var(--carbon)", borderRadius: 6, marginBottom: 12, fontFamily: "Space Mono", fontSize: 11, color: "var(--amber)" }}>
           <span className="spinner" style={{ marginRight: 8 }} />
           Awaiting Validator Nodes Consensus on Quality Details...
         </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Depot</label>
          <select className="form-select" value={form.depotId} onChange={e => set("depotId", e.target.value)}>
            <option value="">— Manual / Unknown —</option>
            {depots.map(d => <option key={d._id} value={d._id}>{d.name} ({d.type})</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Measured Tons *</label>
          <input className="form-input" type="number" step="0.01"
            value={form.measuredTons} onChange={e => set("measuredTons", e.target.value)}
            placeholder={`Auth: ${shipment.authorizedTons}t`} />
        </div>
      </div>
      
      <div style={{ fontFamily: "Space Mono", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", marginBottom: 8, marginTop: 4 }}>
        Coal Quality Metrics (Optional)
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
        <input className="form-input" style={{ fontSize: 12, padding: "6px 10px" }} value={form.grade} onChange={e => set("grade", e.target.value)} placeholder="Grade (e.g. A1)" />
        <input className="form-input" style={{ fontSize: 12, padding: "6px 10px" }} type="number" value={form.moisturePercent} onChange={e => set("moisturePercent", e.target.value)} placeholder="Moisture %" />
        <input className="form-input" style={{ fontSize: 12, padding: "6px 10px" }} type="number" value={form.ashPercent} onChange={e => set("ashPercent", e.target.value)} placeholder="Ash %" />
        <input className="form-input" style={{ fontSize: 12, padding: "6px 10px" }} type="number" value={form.calorificValue} onChange={e => set("calorificValue", e.target.value)} placeholder="GCV (kcal/kg)" />
      </div>

      <div className="form-group" style={{ marginBottom: 12 }}>
        <label className="form-label">Notes</label>
        <input className="form-input" value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Weigh bridge ID, inspector name..." />
      </div>
      <button className="btn btn-primary" style={{ width: "100%" }} onClick={submit} disabled={loading || !form.measuredTons}>
        {loading ? <><span className="spinner" /> Broadcasting to Chain...</> : "⬢ Submit Depot Scan"}
      </button>
      <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)", textAlign: "center" }}>
        Tolerance ±2% = {(shipment.authorizedTons * 0.98).toFixed(1)}t – {(shipment.authorizedTons * 1.02).toFixed(1)}t
      </div>
    </div>
  );
}

function AddDepotModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", location: "", lat: "", lng: "", type: "Transit", radiusMeters: 500 });
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name || !form.lat || !form.lng) return;
    setLoading(true);
    try {
      await createDepot({ ...form, lat: +form.lat, lng: +form.lng, radiusMeters: +form.radiusMeters });
      onCreated(); onClose();
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Register Depot</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Depot Name *</label>
              <input className="form-input" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Dhanbad Weigh Station" />
            </div>
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={form.type} onChange={e => set("type", e.target.value)}>
                {["Origin", "Transit", "Destination"].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: "1/-1" }}>
              <label className="form-label">Address / Location</label>
              <input className="form-input" value={form.location} onChange={e => set("location", e.target.value)} placeholder="NH58, Km 42, Jharkhand" />
            </div>
            <div className="form-group">
              <label className="form-label">Latitude *</label>
              <input className="form-input" type="number" step="0.0001" value={form.lat} onChange={e => set("lat", e.target.value)} placeholder="23.7965" />
            </div>
            <div className="form-group">
              <label className="form-label">Longitude *</label>
              <input className="form-input" type="number" step="0.0001" value={form.lng} onChange={e => set("lng", e.target.value)} placeholder="86.4304" />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>Save Depot</button>
        </div>
      </div>
    </div>
  );
}

export default function Tracking() {
  const [shipments, setShipments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [depots, setDepots] = useState([]);
  const [liveEvents, setLiveEvents] = useState([]);
  const [showAddDepot, setShowAddDepot] = useState(false);
  const [loading, setLoading] = useState(true);
  const eventSourceRef = useRef(null);

  const loadDepots = () => getDepots().then(r => setDepots(r.data.data)).catch(() => {});

  useEffect(() => {
    Promise.all([
      getShipments({ limit: 50 }),
      loadDepots(),
    ]).then(([s]) => { setShipments(s.data.data); }).finally(() => setLoading(false));
  }, []);

  const loadDetail = useCallback(async (id) => {
    const r = await getShipment(id);
    setDetail(r.data);
  }, []);

  const selectShipment = useCallback((s) => {
    setSelected(s._id);
    setLiveEvents([]);
    loadDetail(s._id);

    // Close previous SSE
    if (eventSourceRef.current) eventSourceRef.current.close();

    // Open SSE for live tracking
    const es = new EventSource(`${API}/api/shipments/${s._id}/live`);
    es.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setLiveEvents(prev => [{ ...data, _t: Date.now() }, ...prev].slice(0, 50));
      if (data.type === "ping") {
        setDetail(prev => {
          if (!prev) return prev;
          const trail = [...(prev.data.gpsTrail || []), data];
          return { ...prev, data: { ...prev.data, gpsTrail: trail, lastLocation: data } };
        });
      }
      if (data.type === "alert") {
        loadDetail(s._id); // reload to get new alert
      }
    };
    eventSourceRef.current = es;
  }, [loadDetail]);

  useEffect(() => () => eventSourceRef.current?.close(), []);

  const shipment = detail?.data;
  const alerts = detail?.alerts || [];
  const trail = shipment?.gpsTrail || [];
  const last = shipment?.lastLocation;

  return (
    <Layout title="Live Truck Tracking">
      {showAddDepot && <AddDepotModal onClose={() => setShowAddDepot(false)} onCreated={loadDepots} />}

      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, height: "calc(100vh - 120px)" }}>

        {/* Left: shipment list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 0, overflow: "hidden" }}>
          <div style={{ background: "var(--carbon)", borderRadius: "8px 8px 0 0", padding: "12px 16px", border: "1px solid var(--seam)", borderBottom: "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontFamily: "Space Mono", fontSize: 11, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Active Shipments</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddDepot(true)}>+ Depot</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", background: "var(--carbon)", border: "1px solid var(--seam)", borderRadius: "0 0 8px 8px" }}>
            {loading ? <div style={{ padding: 24, textAlign: "center" }}><div className="spinner" /></div> :
              shipments.length === 0 ? <div className="empty-state"><p>No shipments</p></div> :
              shipments.map(s => (
                <div key={s._id} onClick={() => selectShipment(s)} style={{
                  padding: "14px 16px", cursor: "pointer", borderBottom: "1px solid var(--ore)",
                  background: selected === s._id ? "var(--amber-glow)" : "transparent",
                  borderLeft: selected === s._id ? "3px solid var(--amber)" : "3px solid transparent",
                  transition: "all 0.1s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <strong style={{ fontFamily: "Space Mono", fontSize: 12, color: selected === s._id ? "var(--amber)" : "var(--text)" }}>
                      {s.truckId?.plateNumber}
                    </strong>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_COLOR[s.status], display: "inline-block", boxShadow: `0 0 6px ${STATUS_COLOR[s.status]}`, marginTop: 3 }} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--dim)" }}>{s.truckId?.driverName}</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
                    <span style={{ color: "var(--emerald)" }}>↑</span> {s.origin?.slice(0, 18)}
                    <span style={{ color: "var(--rose)", marginLeft: 6 }}>↓</span> {s.destination?.slice(0, 18)}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                    <span style={{ fontSize: 10, fontFamily: "Space Mono", color: "var(--amber)" }}>{s.authorizedTons}t</span>
                    <span style={{ fontSize: 10, color: STATUS_COLOR[s.status] }}>{s.status}</span>
                  </div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Right: tracking detail */}
        {!shipment ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--carbon)", borderRadius: 8, border: "1px solid var(--seam)" }}>
            <div style={{ textAlign: "center", color: "var(--muted)" }}>
              <div style={{ fontSize: 48, opacity: 0.15, marginBottom: 12 }}>◉</div>
              <div>Select a shipment to track</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>

            {/* Header */}
            <div className="card" style={{ padding: "16px 20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ fontFamily: "Space Mono", fontSize: 18, color: "var(--amber)", fontWeight: 700 }}>{shipment.truckId?.plateNumber}</span>
                    <span className={`badge badge-${shipment.status === "Delivered" ? "active" : shipment.status === "Seized" || shipment.status === "Flagged" ? "revoked" : "pending"}`}>{shipment.status}</span>
                    {alerts.filter(a => !a.resolved).length > 0 && (
                      <span className="badge badge-revoked">🚨 {alerts.filter(a => !a.resolved).length} ALERT{alerts.filter(a => !a.resolved).length > 1 ? "S" : ""}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--dim)", marginTop: 4 }}>
                    Driver: <strong style={{ color: "var(--text)" }}>{shipment.truckId?.driverName}</strong>
                    {shipment.truckId?.driverPhone && <span style={{ color: "var(--muted)", marginLeft: 8 }}>{shipment.truckId.driverPhone}</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
                  {[
                    ["Auth. Load", `${shipment.authorizedTons}t`],
                    ["Checkpoints", shipment.checkpoints?.length || 0],
                    ["Chain ID", `#${shipment.blockchainId}`],
                  ].map(([k, v]) => (
                    <div key={k} style={{ textAlign: "center" }}>
                      <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "Space Mono", textTransform: "uppercase" }}>{k}</div>
                      <div style={{ fontFamily: "Space Mono", color: "var(--amber)", fontWeight: 700 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 8, fontSize: 12 }}>
                <span style={{ color: "var(--emerald)" }}>FROM</span>
                <span style={{ color: "var(--text)" }}>{shipment.origin}</span>
                <span style={{ color: "var(--muted)", margin: "0 4px" }}>→</span>
                <span style={{ color: "var(--rose)" }}>TO</span>
                <span style={{ color: "var(--text)" }}>{shipment.destination}</span>
              </div>
            </div>

            {/* GPS Map */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span className="card-title">GPS Trail</span>
                {last && (
                  <div style={{ fontFamily: "Space Mono", fontSize: 11, color: "var(--sky)" }}>
                    {last.lat?.toFixed(5)}°N {last.lng?.toFixed(5)}°E
                    {last.speedKmh != null && <span style={{ color: "var(--amber)", marginLeft: 8 }}>{last.speedKmh} km/h</span>}
                  </div>
                )}
              </div>
              <TrailMap trail={trail} checkpoints={shipment.checkpoints || []} origin={shipment.origin} destination={shipment.destination} />
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--muted)", fontFamily: "Space Mono" }}>
                {trail.length} GPS points recorded
                {last?.ts && ` · Last ping: ${new Date(last.ts).toLocaleTimeString()}`}
              </div>
            </div>

            {/* Depot scan + checkpoint log side by side */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <DepotScanPanel
                shipment={shipment}
                depots={depots}
                onScanned={() => loadDetail(shipment._id)}
              />

              {/* Checkpoint history */}
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>Checkpoint Log ({shipment.checkpoints?.length || 0})</div>
                {!shipment.checkpoints?.length ? (
                  <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: "20px 0" }}>No scans yet</div>
                ) : (
                  <div style={{ maxHeight: 260, overflowY: "auto" }}>
                    {[...shipment.checkpoints].reverse().map((cp, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--ore)", alignItems: "flex-start" }}>
                        <div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 3 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: cp.tonsMatch ? "var(--emerald)" : "var(--rose)", display: "inline-block", flexShrink: 0 }} />
                            <strong style={{ fontSize: 13, color: "var(--text)" }}>{cp.location}</strong>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted)" }}>{new Date(cp.scannedAt).toLocaleString()}</div>
                          {cp.notes && <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", marginTop: 2 }}>{cp.notes}</div>}
                          {cp.coalQuality && (
                            <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                              {cp.coalQuality.grade && <span className="badge badge-active" style={{ fontSize: 9 }}>{cp.coalQuality.grade}</span>}
                              {cp.coalQuality.moisturePercent != null && <span style={{ fontSize: 10, color: "var(--muted)" }}>💧 {cp.coalQuality.moisturePercent}%</span>}
                              {cp.coalQuality.ashPercent != null && <span style={{ fontSize: 10, color: "var(--muted)" }}>🌫 {cp.coalQuality.ashPercent}%</span>}
                              {cp.coalQuality.calorificValue != null && <span style={{ fontSize: 10, color: "var(--muted)" }}>🔥 {cp.coalQuality.calorificValue} kcal</span>}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontFamily: "Space Mono", fontSize: 13, color: cp.tonsMatch ? "var(--emerald)" : "var(--rose)" }}>
                            {cp.reportedTons}t
                          </div>
                          {cp.diff != null && !cp.tonsMatch && (
                            <div style={{ fontSize: 11, color: "var(--rose)", fontFamily: "Space Mono" }}>
                              {cp.diff > 0 ? "+" : ""}{cp.diff?.toFixed(2)}t
                            </div>
                          )}
                          <span className={`badge badge-${cp.tonsMatch ? "active" : "revoked"}`} style={{ fontSize: 9 }}>
                            {cp.tonsMatch ? "OK" : "MISMATCH"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Live event feed */}
            {liveEvents.length > 0 && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>
                  Live Feed
                  <span style={{ marginLeft: 8, width: 6, height: 6, borderRadius: "50%", background: "var(--emerald)", display: "inline-block", animation: "pulse 1.5s infinite" }} />
                </div>
                <div style={{ maxHeight: 120, overflowY: "auto", fontFamily: "Space Mono", fontSize: 11 }}>
                  {liveEvents.map((e, i) => (
                    <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid var(--ore)", color: e.type === "alert" ? "var(--rose)" : "var(--sky)" }}>
                      {e.type === "ping"
                        ? `→ GPS ${e.lat?.toFixed(4)}, ${e.lng?.toFixed(4)} @ ${e.speedKmh}km/h`
                        : `⚠ ${e.severity} ALERT: ${e.reason} at ${e.depot} (${e.diff > 0 ? "+" : ""}${e.diff?.toFixed(2)}t)`}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Alerts */}
            {alerts.length > 0 && (
              <div className="card">
                <div className="card-title" style={{ marginBottom: 12 }}>Alerts on This Shipment</div>
                {alerts.map(a => (
                  <div key={a._id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: a.resolved ? "var(--ore)" : "rgba(244,63,94,0.06)", borderRadius: 6, marginBottom: 6, border: "1px solid var(--seam)", borderLeftWidth: 3, borderLeftColor: a.resolved ? "var(--seam)" : "var(--rose)" }}>
                    <div>
                      <span className={`badge badge-${a.resolved ? "expired" : "revoked"}`} style={{ marginRight: 8 }}>{a.severity}</span>
                      <code style={{ fontSize: 12 }}>{a.reason?.replace(/_/g, " ")}</code>
                      {a.notes && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{a.notes}</div>}
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12 }}>
                      <div style={{ fontFamily: "Space Mono", color: "var(--rose)" }}>
                        {a.expectedTons}t → {a.reportedTons}t
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: 11 }}>{new Date(a.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}