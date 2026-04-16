import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { getDashboard, getTruckAnalytics, coalTypeColors } from "../utils/api";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from "recharts";

const COLORS = ["#f59e0b", "#10b981", "#38bdf8", "#f43f5e", "#8b5cf6"];
const SHIP_COLORS = { Dispatched: "#f59e0b", InTransit: "#38bdf8", Flagged: "#f97316", Delivered: "#10b981", Seized: "#f43f5e" };

function StatCard({ label, value, sub, accent, warn }) {
  return (
    <div className="stat-card">
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: accent || "var(--amber)" }} />
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={warn ? { color: "var(--rose)" } : {}}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--carbon)", border: "1px solid var(--seam)", padding: "10px 14px", borderRadius: 6 }}>
      <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "Space Mono", marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ fontSize: 13, color: p.color || "var(--amber)" }}>{p.name}: <strong>{p.value?.toLocaleString()}</strong></div>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [truckData, setTruckData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDashboard(), getTruckAnalytics()])
      .then(([d, t]) => { setData(d.data.data); setTruckData(t.data.data); })
      .catch(console.error).finally(() => setLoading(false));
  }, []);

  const byStatus = data?.concessionsByStatus || [];
  const byType = data?.concessionsByCoalType || [];
  const trend = data?.extractionTrend || [];
  const shipByStatus = truckData?.shipmentsByStatus || [];
  const totalConcessions = byStatus.reduce((s, x) => s + x.count, 0);
  const activeConcessions = byStatus.find(x => x._id === "Active")?.count || 0;
  const activeAlerts = truckData?.activeAlerts || 0;
  const activeTrucks = truckData?.activeTrucks || 0;

  return (
    <Layout title="Operations Dashboard">
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}>
          <div className="spinner" style={{ width: 40, height: 40 }} />
        </div>
      ) : (
        <>
          {activeAlerts > 0 && (
            <div className="alert alert-error" style={{ marginBottom: 20 }}>
              🚨 {activeAlerts} unresolved theft alert{activeAlerts > 1 ? "s" : ""} — <a href="/alerts" style={{ color: "inherit", textDecoration: "underline" }}>view alerts</a>
            </div>
          )}

          <div className="stats-grid">
            <StatCard label="Total Concessions" value={totalConcessions} sub="All time" />
            <StatCard label="Active Licenses" value={activeConcessions} sub="Currently operating" accent="var(--emerald)" />
            <StatCard label="Active Trucks" value={activeTrucks} sub="Fleet size" accent="var(--sky)" />
            <StatCard label="Theft Alerts" value={activeAlerts} sub="Unresolved" accent="var(--rose)" warn={activeAlerts > 0} />
          </div>

          <div className="charts-grid">
            <div className="card">
              <div className="card-header"><span className="card-title">Extraction Trend (30 days)</span></div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="amberGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="_id" tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "Space Mono" }} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "Space Mono" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="tons" name="Tons" stroke="#f59e0b" fill="url(#amberGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">Shipments by Status</span></div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={shipByStatus} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={75} innerRadius={35}>
                    {shipByStatus.map((entry, i) => <Cell key={i} fill={SHIP_COLORS[entry._id] || COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend formatter={(v) => <span style={{ fontSize: 12, color: "var(--dim)" }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <div className="card-header"><span className="card-title">Extraction by Coal Type</span></div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={byType}>
                  <XAxis dataKey="_id" tick={{ fill: "#6b7280", fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 10, fontFamily: "Space Mono" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="totalExtracted" name="Extracted (tons)" radius={[3, 3, 0, 0]}>
                    {byType.map((entry, i) => (
                      <Cell key={i} fill={coalTypeColors[entry._id] || COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Recent Alerts */}
          {truckData?.recentAlerts?.length > 0 && (
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="card-header">
                <span className="card-title">Recent Theft Alerts</span>
                <a href="/alerts" className="btn btn-secondary btn-sm">View All</a>
              </div>
              {truckData.recentAlerts.map(a => (
                <div key={a._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--ore)" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.severity === "Critical" ? "var(--rose)" : a.severity === "High" ? "#f97316" : "var(--amber)", display: "inline-block", flexShrink: 0, boxShadow: `0 0 6px currentColor` }} />
                    <div>
                      <strong style={{ color: "var(--text)", fontSize: 13 }}>{a.severity} — {a.reason?.replace(/_/g, " ")}</strong>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>Truck: {a.shipmentId?.truckId?.plateNumber || "—"}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>{new Date(a.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}

          <div className="card">
            <div className="card-header"><span className="card-title">Recent Extractions</span></div>
            {data?.recentExtractions?.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Batch ID</th><th>Concession</th><th>Tons</th><th>Tx Hash</th><th>Date</th>
                  </tr></thead>
                  <tbody>
                    {data.recentExtractions.map(e => (
                      <tr key={e._id}>
                        <td><code style={{ fontSize: 11, color: "var(--amber)" }}>{e.batchId}</code></td>
                        <td>{e.concessionId?.companyName || "—"}</td>
                        <td><strong style={{ color: "var(--text)" }}>{e.tons?.toLocaleString()}</strong></td>
                        <td><span className="hash">{e.txHash ? e.txHash.slice(0, 20) + "..." : "—"}</span></td>
                        <td>{new Date(e.createdAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state"><p>No extractions recorded yet.</p></div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
