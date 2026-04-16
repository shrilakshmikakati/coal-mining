import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import { getConcessions, createConcession, deployConcession, updateStatus } from "../utils/api";

const STATUSES = ["Active", "Pending", "Suspended", "Expired", "Revoked"];
const COAL_TYPES = ["Anthracite", "Bituminous", "Sub-bituminous", "Lignite"];

function Badge({ status }) {
  return <span className={`badge badge-${status?.toLowerCase()}`}>{status}</span>;
}

function QuotaBar({ extracted, max }) {
  const pct = Math.min((extracted / max) * 100, 100);
  const cls = pct > 90 ? "danger" : pct > 70 ? "warn" : "";
  return (
    <div className="quota-wrap">
      <div className="quota-text">
        <span>{extracted?.toLocaleString()} t</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="progress-bar">
        <div className={`progress-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CreateModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    companyName: "", ownerAddress: "", location: "",
    areaHectares: "", maxExtractionTons: "", coalType: "Bituminous", durationDays: "365",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.companyName || !form.ownerAddress || !form.location) {
      return setError("Please fill all required fields");
    }
    setLoading(true); setError("");
    try {
      const r = await createConcession({
        ...form,
        areaHectares: +form.areaHectares,
        maxExtractionTons: +form.maxExtractionTons,
        durationDays: +form.durationDays,
      });
      onCreated(r.data.data);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || "Failed to create concession");
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Grant New Concession</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">⚠ {error}</div>}
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Company Name *</label>
              <input className="form-input" value={form.companyName} onChange={e => set("companyName", e.target.value)} placeholder="Coal Corp Ltd." />
            </div>
            <div className="form-group">
              <label className="form-label">Coal Type *</label>
              <select className="form-select" value={form.coalType} onChange={e => set("coalType", e.target.value)}>
                {COAL_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">Owner Wallet Address *</label>
              <input className="form-input" value={form.ownerAddress} onChange={e => set("ownerAddress", e.target.value)} placeholder="0x..." />
            </div>
            <div className="form-group" style={{ gridColumn: "1 / -1" }}>
              <label className="form-label">Mining Location *</label>
              <input className="form-input" value={form.location} onChange={e => set("location", e.target.value)} placeholder="District, State, Country" />
            </div>
            <div className="form-group">
              <label className="form-label">Area (Hectares) *</label>
              <input className="form-input" type="number" value={form.areaHectares} onChange={e => set("areaHectares", e.target.value)} placeholder="500" />
            </div>
            <div className="form-group">
              <label className="form-label">Max Extraction (Tons) *</label>
              <input className="form-input" type="number" value={form.maxExtractionTons} onChange={e => set("maxExtractionTons", e.target.value)} placeholder="50000" />
            </div>
            <div className="form-group">
              <label className="form-label">Duration (Days) *</label>
              <input className="form-input" type="number" value={form.durationDays} onChange={e => set("durationDays", e.target.value)} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? <><span className="spinner" /> Processing...</> : "Create & Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailModal({ concession, onClose, onRefresh }) {
  const [deploying, setDeploying] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const deploy = async () => {
    setDeploying(true); setMsg("");
    try {
      const r = await deployConcession(concession._id);
      setMsg(`✓ Deployed! Block ID: ${r.data.blockchainId}`);
      onRefresh();
    } catch (e) {
      setMsg("✗ " + (e.response?.data?.error || "Deployment failed"));
    } finally { setDeploying(false); }
  };

  const changeStatus = async (s) => {
    setStatusLoading(true);
    try {
      await updateStatus(concession._id, s);
      setMsg(`✓ Status updated to ${s}`);
      onRefresh();
    } catch (e) {
      setMsg("✗ " + (e.response?.data?.error || "Update failed"));
    } finally { setStatusLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <span className="modal-title">Concession Details</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {msg && <div className={`alert ${msg.startsWith("✓") ? "alert-success" : "alert-error"}`}>{msg}</div>}
          <div className="detail-row">
            <span className="detail-key">Company</span>
            <span className="detail-val" style={{ color: "var(--amber)", fontFamily: "Space Mono" }}>{concession.companyName}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Status</span>
            <Badge status={concession.status} />
          </div>
          <div className="detail-row">
            <span className="detail-key">Location</span>
            <span className="detail-val">{concession.location}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Coal Type</span>
            <span className="detail-val">{concession.coalType}</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Area</span>
            <span className="detail-val">{concession.areaHectares?.toLocaleString()} ha</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Max Extraction</span>
            <span className="detail-val">{concession.maxExtractionTons?.toLocaleString()} tons</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Extracted</span>
            <div style={{ textAlign: "right", minWidth: 200 }}>
              <QuotaBar extracted={concession.extractedTons || 0} max={concession.maxExtractionTons} />
            </div>
          </div>
          {concession.blockchainId && (
            <>
              <div className="detail-row">
                <span className="detail-key">Blockchain ID</span>
                <span className="detail-val" style={{ color: "var(--emerald)", fontFamily: "Space Mono" }}>#{concession.blockchainId}</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Tx Hash</span>
                <span className="hash">{concession.txHash?.slice(0, 32)}...</span>
              </div>
              <div className="detail-row">
                <span className="detail-key">Expires</span>
                <span className="detail-val">{concession.expiresAt ? new Date(concession.expiresAt).toLocaleDateString() : "—"}</span>
              </div>
            </>
          )}
          <div className="detail-row">
            <span className="detail-key">License Hash</span>
            <span className="hash">{concession.licenseHash?.slice(0, 24)}...</span>
          </div>
          <div className="detail-row">
            <span className="detail-key">Owner Address</span>
            <span className="hash">{concession.ownerAddress}</span>
          </div>

          {!concession.blockchainId && (
            <div style={{ marginTop: 20 }}>
              <button className="btn btn-primary" onClick={deploy} disabled={deploying} style={{ width: "100%" }}>
                {deploying ? <><span className="spinner" /> Deploying to Blockchain...</> : "⬡ Deploy to Ganache (PoW)"}
              </button>
            </div>
          )}

          {concession.blockchainId && concession.status !== "Revoked" && (
            <div style={{ marginTop: 20 }}>
              <div className="form-label" style={{ marginBottom: 8 }}>Update Status</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {STATUSES.filter(s => s !== concession.status && s !== "Pending").map(s => (
                  <button key={s} className={`btn btn-sm ${s === "Revoked" ? "btn-danger" : "btn-secondary"}`}
                    onClick={() => changeStatus(s)} disabled={statusLoading}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function Concessions() {
  const [concessions, setConcessions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filters, setFilters] = useState({ status: "", coalType: "", page: 1 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getConcessions({ ...filters });
      setConcessions(r.data.data);
      setTotal(r.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  return (
    <Layout title="Concessions">
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={load} />}
      {selected && <DetailModal concession={selected} onClose={() => setSelected(null)} onRefresh={() => { load(); setSelected(null); }} />}

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ Grant Concession</button>
        <select className="form-select" style={{ width: 160 }} value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value, page: 1 }))}>
          <option value="">All Statuses</option>
          {STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="form-select" style={{ width: 160 }} value={filters.coalType} onChange={e => setFilters(f => ({ ...f, coalType: e.target.value, page: 1 }))}>
          <option value="">All Coal Types</option>
          {COAL_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)", alignSelf: "center" }}>
          {total} total
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}><div className="spinner" /></div>
        ) : concessions.length === 0 ? (
          <div className="empty-state">
            <h3>No Concessions Found</h3>
            <p>Grant a new concession to get started</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Company</th><th>Location</th><th>Coal Type</th>
                <th>Area (ha)</th><th>Quota Usage</th><th>Status</th><th>Chain</th><th></th>
              </tr></thead>
              <tbody>
                {concessions.map(c => (
                  <tr key={c._id}>
                    <td><strong style={{ color: "var(--text)" }}>{c.companyName}</strong></td>
                    <td>{c.location}</td>
                    <td>{c.coalType}</td>
                    <td>{c.areaHectares?.toLocaleString()}</td>
                    <td style={{ minWidth: 160 }}>
                      <QuotaBar extracted={c.extractedTons || 0} max={c.maxExtractionTons} />
                    </td>
                    <td><Badge status={c.status} /></td>
                    <td>
                      {c.blockchainId
                        ? <span className="badge badge-active">#{c.blockchainId}</span>
                        : <span className="badge badge-expired">Off-chain</span>}
                    </td>
                    <td>
                      <button className="btn btn-secondary btn-sm" onClick={() => setSelected(c)}>View</button>
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
