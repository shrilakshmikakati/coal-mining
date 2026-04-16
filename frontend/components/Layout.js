import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { getBlockchainInfo } from "../utils/api";

const NAV = [
  { href: "/", label: "Dashboard", icon: "⬡" },
  { href: "/concessions", label: "Concessions", icon: "◈" },
  { href: "/extractions", label: "Extractions", icon: "⬢" },
  { href: "/trucks", label: "Trucks", icon: "◉" },
  { href: "/shipments", label: "Shipments", icon: "⬖" },
  { href: "/tracking", label: "Live Tracking", icon: "⊕" },
  { href: "/alerts", label: "Theft Alerts", icon: "⚠" },
  { href: "/blockchain", label: "Chain Explorer", icon: "⬟" },
];

export default function Layout({ children, title = "Dashboard" }) {
  const router = useRouter();
  const [chainInfo, setChainInfo] = useState(null);

  useEffect(() => {
    getBlockchainInfo().then(r => setChainInfo(r.data.data)).catch(() => {});
    const interval = setInterval(() => {
      getBlockchainInfo().then(r => setChainInfo(r.data.data)).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Coal Chain</h1>
          <span>Concession Management</span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${router.pathname === item.href ? "active" : ""}`}
            >
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="chain-status">
            <div className="chain-dot" style={{ background: chainInfo ? "var(--emerald)" : "var(--rose)" }} />
            <div>
              <div>{chainInfo ? "GANACHE CONNECTED" : "DISCONNECTED"}</div>
              {chainInfo && <div style={{ color: "var(--amber)", marginTop: 2 }}>BLOCK #{chainInfo.latestBlock}</div>}
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <h2 className="page-title">{title}</h2>
          <div className="topbar-right">
            {chainInfo && (
              <>
                <div className="block-info">NET ID: {chainInfo.networkId}</div>
                <div className="block-info" style={{ color: "var(--amber)" }}>
                  PoS // BLOCK {chainInfo.latestBlock}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}