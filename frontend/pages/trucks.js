import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import { getTrucks, createTruck, registerTruckOnChain, updateTruck } from "../utils/api";

function RegisterModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    plateNumber: "", driverName: "", driverPhone: "",
    operatorAddress: "", capacity: "", make: "", model: "", gpsDeviceId: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.plateNumber || !form.driverName || !form.operatorAddress || !form.capacity)
      return setError("Plate, driver name, operator address and capacity are required");
    setLoading(true); setError("");
    try {
      await createTruck({ ...form, capacity: +form.capacity });
      onCreated();
      onClose();
    } catch (e) { setError(e.response?.data?.error || "Failed to register truck"); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Register New Truck</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">⚠ {error}</div>}
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Plate Number *</label>
              <input className="form-input" value={form.plateNumber} onChange={e => set("plateNumber", e.target.value.toUpperCase())} placeholder="MH12AB1234" />
            </div>
            <div className="form-group">
              <label className="form-label">Capacity (Tons) *</label>
              <input className="form-input" type="number" value={form.capacity} onChange={e => set("capacity", e.target.value)} placeholder="30" />
            </div>
            <div className="form-group">
              <label className="form-label">Driver Name *</label>
              <input className="form-input" value={form.driverName} onChange={e => set("driverName", e.target.value)} placeholder="Ravi Kumar" />
            </div>
            <div className="form-group">
              <label className="form-label">Driver Phone</label>
              <input className="form-input" value={form.driverPhone} onChange={e => set("driverPhone", e.target.value)} placeholder="+91 9876543210" />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">Operator Wallet Address *</label>
              <input className="form-input" value={form.operatorAddress} onChange={e => set("operatorAddress", e.target.value)} placeholder="0x..." />
            </div>
            <div className="form-group">
              <label className="form-label">Make</label>
              <input className="form-input" value={form.make} onChange={e => set("make", e.target.value)} placeholder="TATA" />
            </div>
            <div className="form-group">
              <label className="form-label">Model</label>
              <input className="form-input" value={form.model} onChange={e => set("model", e.target.value)} placeholder="LPT 2518" />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">GPS Device ID</label>
              <input className="form-input" value={form.gpsDeviceId} onChange={e => set("gpsDeviceId", e.target.value)} placeholder="GPS-UNIT-001" />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? <><span className="spinner" /> Saving...</> : "Register Truck"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Trucks() {
  const [trucks, setTrucks] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deployingId, setDeployingId] = useState(null);
  const [msg, setMsg] = useState({ id: null, text: "", type: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getTrucks({ limit: 50 });
      setTrucks(r.data.data);
      setTotal(r.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const deployChain = async (truck) => {
    setDeployingId(truck._id);
    try {
      const r = await registerTruckOnChain(truck._id);
      setMsg({ id: truck._id, text: `Chain ID: #${r.data.blockchainId}`, type: "success" });
      load();
    } catch (e) {
      setMsg({ id: truck._id, text: e.response?.data?.error || "Failed", type: "error" });
    }
    setDeployingId(null);
  };

  const toggleActive = async (truck) => {
    await updateTruck(truck._id, { active: !truck.active });
    load();
  };

  return (
    <Layout title="Truck Fleet">
      {showCreate && <RegisterModal onClose={() => setShowCreate(false)} onCreated={load} />}

      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Register Truck</button>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>{total} trucks total</div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}><div className="spinner" /></div>
        ) : trucks.length === 0 ? (
          <div className="empty-state">
            <h3>No Trucks Registered</h3>
            <p>Register trucks to begin tracking coal shipments</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Plate</th><th>Driver</th><th>Make / Model</th>
                <th>Capacity</th><th>GPS</th><th>Chain</th><th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {trucks.map(t => (
                  <tr key={t._id}>
                    <td>
                      <strong style={{ fontFamily: "Space Mono", color: "var(--amber)", fontSize: 13 }}>{t.plateNumber}</strong>
                    </td>
                    <td>
                      <div style={{ color: "var(--text)", fontWeight: 600 }}>{t.driverName}</div>
                      {t.driverPhone && <div style={{ fontSize: 11, color: "var(--muted)" }}>{t.driverPhone}</div>}
                    </td>
                    <td>{t.make || "—"} {t.model || ""}</td>
                    <td><span style={{ fontFamily: "Space Mono" }}>{t.capacity}t</span></td>
                    <td>
                      {t.gpsDeviceId
                        ? <span className="badge badge-active">{t.gpsDeviceId}</span>
                        : <span style={{ color: "var(--muted)", fontSize: 12 }}>—</span>}
                    </td>
                    <td>
                      {t.blockchainId
                        ? <span className="badge badge-active">#{t.blockchainId}</span>
                        : <span className="badge badge-expired">Off-chain</span>}
                    </td>
                    <td>
                      <span className={`badge badge-${t.active ? "active" : "expired"}`}>
                        {t.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {!t.blockchainId && (
                          <button className="btn btn-secondary btn-sm" onClick={() => deployChain(t)}
                            disabled={deployingId === t._id}>
                            {deployingId === t._id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : "⬡ Chain"}
                          </button>
                        )}
                        <button className={`btn btn-sm ${t.active ? "btn-danger" : "btn-secondary"}`}
                          onClick={() => toggleActive(t)}>
                          {t.active ? "Disable" : "Enable"}
                        </button>
                      </div>
                      {msg.id === t._id && (
                        <div style={{ fontSize: 11, marginTop: 4, color: msg.type === "success" ? "var(--emerald)" : "var(--rose)" }}>
                          {msg.text}
                        </div>
                      )}
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