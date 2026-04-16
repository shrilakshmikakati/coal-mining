import { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout";
import { getExtractions, recordExtraction, getConcessions } from "../utils/api";

function RecordModal({ onClose, onRecorded }) {
  const [concessions, setConcessions] = useState([]);
  const [form, setForm] = useState({
    concessionMongoId: "", tons: "", grade: "", moisturePercent: "",
    ashPercent: "", calorificValue: "", notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getConcessions({ status: "Active", limit: 100 }).then(r => setConcessions(r.data.data)).catch(() => {});
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.concessionMongoId || !form.tons) return setError("Select concession and enter tons");
    setLoading(true); setError("");
    try {
      const payload = {
        concessionMongoId: form.concessionMongoId,
        tons: +form.tons,
        notes: form.notes,
        coalQuality: {
          grade: form.grade,
          moisturePercent: +form.moisturePercent || undefined,
          ashPercent: +form.ashPercent || undefined,
          calorificValue: +form.calorificValue || undefined,
        },
      };
      const r = await recordExtraction(payload);
      onRecorded(r.data.data);
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || "Recording failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">Record Coal Extraction</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">⚠ {error}</div>}
          <div className="alert alert-info">⬡ This transaction will be recorded on the Ganache blockchain (PoW)</div>

          <div className="form-group">
            <label className="form-label">Active Concession *</label>
            <select className="form-select" value={form.concessionMongoId} onChange={e => set("concessionMongoId", e.target.value)}>
              <option value="">Select a concession...</option>
              {concessions.map(c => (
                <option key={c._id} value={c._id}>
                  {c.companyName} — {c.location} (#{c.blockchainId})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Tons Extracted *</label>
            <input className="form-input" type="number" value={form.tons} onChange={e => set("tons", e.target.value)} placeholder="1000" />
          </div>

          <div style={{ marginBottom: 12, fontSize: 11, color: "var(--muted)", fontFamily: "Space Mono", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Coal Quality Data (Optional)
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Grade</label>
              <input className="form-input" value={form.grade} onChange={e => set("grade", e.target.value)} placeholder="A1, B2..." />
            </div>
            <div className="form-group">
              <label className="form-label">Moisture %</label>
              <input className="form-input" type="number" value={form.moisturePercent} onChange={e => set("moisturePercent", e.target.value)} placeholder="8.5" />
            </div>
            <div className="form-group">
              <label className="form-label">Ash Content %</label>
              <input className="form-input" type="number" value={form.ashPercent} onChange={e => set("ashPercent", e.target.value)} placeholder="12.3" />
            </div>
            <div className="form-group">
              <label className="form-label">Calorific Value (kcal/kg)</label>
              <input className="form-input" type="number" value={form.calorificValue} onChange={e => set("calorificValue", e.target.value)} placeholder="5800" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-textarea" value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Additional details..." />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? <><span className="spinner" /> Broadcasting Tx...</> : "⬢ Record on Blockchain"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Extractions() {
  const [extractions, setExtractions] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showRecord, setShowRecord] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getExtractions({ page, limit: 25 });
      setExtractions(r.data.data);
      setTotal(r.data.total);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  return (
    <Layout title="Extraction Records">
      {showRecord && <RecordModal onClose={() => setShowRecord(false)} onRecorded={load} />}

      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        <button className="btn btn-primary" onClick={() => setShowRecord(true)}>+ Record Extraction</button>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "var(--muted)" }}>{total} records</div>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}><div className="spinner" /></div>
        ) : extractions.length === 0 ? (
          <div className="empty-state">
            <h3>No Extractions Recorded</h3>
            <p>Record the first coal extraction to see it here</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr>
                <th>Batch ID</th><th>Concession</th><th>Coal Type</th>
                <th>Tons</th><th>Quality</th><th>Tx Hash</th><th>Recorded</th>
              </tr></thead>
              <tbody>
                {extractions.map(e => (
                  <tr key={e._id}>
                    <td>
                      <code style={{ fontSize: 11, color: "var(--amber)", fontFamily: "Space Mono" }}>{e.batchId}</code>
                    </td>
                    <td>
                      <div style={{ color: "var(--text)", fontWeight: 600 }}>{e.concessionId?.companyName || "—"}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{e.concessionId?.location}</div>
                    </td>
                    <td>{e.concessionId?.coalType || "—"}</td>
                    <td>
                      <span style={{ color: "var(--text)", fontWeight: 700, fontFamily: "Space Mono" }}>
                        {e.tons?.toLocaleString()}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>t</span>
                    </td>
                    <td>
                      {e.coalQuality?.grade ? (
                        <div>
                          <span className="badge badge-active" style={{ marginBottom: 2 }}>{e.coalQuality.grade}</span>
                          {e.coalQuality.calorificValue && (
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{e.coalQuality.calorificValue} kcal/kg</div>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td>
                      {e.txHash
                        ? <span className="hash">{e.txHash.slice(0, 18)}...</span>
                        : <span className="badge badge-expired">Pending</span>}
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted)" }}>
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 25 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 12, marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--seam)" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>← Prev</button>
            <span style={{ fontSize: 13, color: "var(--muted)", alignSelf: "center" }}>Page {page} of {Math.ceil(total / 25)}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 25)}>Next →</button>
          </div>
        )}
      </div>
    </Layout>
  );
}
