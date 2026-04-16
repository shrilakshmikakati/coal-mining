import { useState, useEffect } from "react";
import Layout from "../components/Layout";
import { getBlockchainInfo, getConcessions } from "../utils/api";

export default function BlockchainExplorer() {
  const [info, setInfo] = useState(null);
  const [concessions, setConcessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getBlockchainInfo(),
      getConcessions({ limit: 100 }),
    ]).then(([b, c]) => {
      setInfo(b.data.data);
      setConcessions(c.data.data.filter(x => x.blockchainId));
    }).catch(console.error).finally(() => setLoading(false));

    const iv = setInterval(() => {
      getBlockchainInfo().then(r => setInfo(r.data.data)).catch(() => {});
    }, 5000);
    return () => clearInterval(iv);
  }, []);

  return (
    <Layout title="Blockchain Explorer">
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}><div className="spinner" style={{ width: 40, height: 40 }} /></div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
            <div className="card" style={{ borderColor: "rgba(245,158,11,0.3)" }}>
              <div className="card-title" style={{ marginBottom: 16 }}>Network Status</div>
              {[
                ["RPC Server",    "HTTP://127.0.0.1:7545"],
                ["Network ID",   info?.networkId],
                ["Hardfork",     "MERGE (Paris EVM)"],
                ["Mining Mode",  "AUTOMINING"],
                ["Latest Block", `#${info?.latestBlock}`],
                ["Gas Price",    "20,000,000,000 wei"],
              ].map(([k, v]) => (
                <div className="detail-row" key={k}>
                  <span className="detail-key">{k}</span>
                  <span className="detail-val" style={{
                    fontFamily: ["Latest Block","Gas Price","Network ID"].includes(k) ? "Space Mono" : undefined,
                    fontSize: k === "RPC Server" ? 12 : undefined,
                    color: k === "Mining Mode" ? "var(--emerald)" : k === "Hardfork" ? "var(--sky)" : undefined,
                  }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}>Regulator Account</div>
              {[
                ["Address",            info?.regulator],
                ["Balance",            `${parseFloat(info?.balance || 0).toFixed(4)} ETH`],
                ["Role",               "Contract Regulator"],
                ["CoalConcession",     info?.contractAddress],
                ["TruckTracking",      info?.truckContractAddress],
                ["On-chain Concessions", concessions.length],
              ].map(([k, v]) => (
                <div className="detail-row" key={k}>
                  <span className="detail-key">{k}</span>
                  <span className="detail-val" style={{
                    fontFamily: ["Address","CoalConcession","TruckTracking"].includes(k) ? "Space Mono" : undefined,
                    fontSize: ["Address","CoalConcession","TruckTracking"].includes(k) ? 10 : undefined,
                    color: k === "Balance" ? "var(--amber)" : k === "Role" ? "var(--sky)" : undefined,
                    wordBreak: "break-all", textAlign: "right",
                  }}>
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* How it works */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <span className="card-title">How Transactions Work on This Network</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {[
                { step: "01", title: "Transaction Sent",    col: "var(--amber)",   desc: "Backend signs and broadcasts a transaction (grant/dispatch/checkpoint) to Ganache via Web3.js." },
                { step: "02", title: "Automining",          col: "var(--sky)",     desc: "Ganache instantly mines a new block containing the transaction. Network ID 1337, MERGE hardfork." },
                { step: "03", title: "Immutable State",     col: "var(--emerald)", desc: "Smart contract state updates on-chain. Seal hashes, ton records, and alerts are tamper-proof." },
                { step: "04", title: "MongoDB Sync",        col: "#8b5cf6",        desc: "Tx hash and blockchain IDs are written to MongoDB for fast querying and analytics." },
              ].map(item => (
                <div key={item.step} style={{ padding: 16, background: "var(--ore)", borderRadius: 6, border: "1px solid var(--seam)" }}>
                  <div style={{ fontFamily: "Space Mono", fontSize: 24, color: item.col, opacity: 0.5, marginBottom: 8 }}>{item.step}</div>
                  <div style={{ fontWeight: 700, marginBottom: 6, color: "var(--text)" }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">On-Chain Concessions ({concessions.length})</span>
            </div>
            {concessions.length === 0 ? (
              <div className="empty-state"><p>No concessions deployed to blockchain yet</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>Chain ID</th><th>Company</th><th>Location</th>
                    <th>Status</th><th>Tx Hash</th><th>Deployed</th>
                  </tr></thead>
                  <tbody>
                    {concessions.map(c => (
                      <tr key={c._id}>
                        <td><span style={{ fontFamily: "Space Mono", color: "var(--amber)", fontWeight: 700 }}>#{c.blockchainId}</span></td>
                        <td><strong style={{ color: "var(--text)" }}>{c.companyName}</strong></td>
                        <td>{c.location}</td>
                        <td><span className={`badge badge-${c.status?.toLowerCase()}`}>{c.status}</span></td>
                        <td><span className="hash">{c.txHash?.slice(0, 20)}...</span></td>
                        <td style={{ fontSize: 12, color: "var(--muted)" }}>
                          {c.issuedAt ? new Date(c.issuedAt).toLocaleDateString() : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </Layout>
  );
}
