import { useEffect, useMemo, useState } from "react";
import SidebarLayout from "../layout/SidebarLayout";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

function StatCard({ title, value, color, icon }) {
  return (
    <div
      className="card"
      style={{ padding: 18, borderBottom: `4px solid ${color}` }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ color: "#64748b", fontSize: 13, fontWeight: 700 }}>
            {title.toUpperCase()}
          </div>
          <div style={{ marginTop: 10, fontSize: 34, fontWeight: 900 }}>
            {value}
          </div>
        </div>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 20,
          }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard({ token, user, onLogout }) {
  const nav = useNavigate();
  const client = useMemo(() => api(token), [token]);

  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [recent, setRecent] = useState([]); // {clientName, title, amount, status}

  const [stats, setStats] = useState({
    totalClients: 0,
    received: 0,
    pending: 0,
    overdueCount: 0,
  });

  async function load() {
    setLoading(true);
    try {
      const list = await client.get("/api/admin/clients");
      setClients(list.data);

      // Compute stats using manual ledger rows
      let totalClients = list.data.length;
      let received = 0;
      let pending = 0;
      let overdueCount = 0;

      const recentItems = [];

      for (const c of list.data.slice(0, 6)) {
        // fetch ledger rows
        const led = await client.get(
          `/api/manual-ledger/contracts/${c.contractId}`
        );
        const rows = led.data.rows || [];

        const totalAmount = led.data.contract.totalAmount;

        const totalPaid = rows.reduce(
          (sum, r) => sum + (Number(r.amountPaid) || 0),
          0
        );
        received += totalPaid;
        pending += Math.max(totalAmount - totalPaid, 0);

        // overdue: dueDate < today AND amountPaid == 0
        const today = new Date();
        overdueCount += rows.filter(
          (r) =>
            new Date(r.dueDate) < today && (Number(r.amountPaid) || 0) === 0
        ).length;

        // recent installments
        rows.slice(0, 3).forEach((r) => {
          recentItems.push({
            clientName: led.data.contract.clientName,
            title: r.description,
            amount: r.installmentAmount,
            status: (Number(r.amountPaid) || 0) > 0 ? "Paid" : "Unpaid",
          });
        });
      }

      setRecent(recentItems.slice(0, 6));

      setStats({
        totalClients,
        received,
        pending,
        overdueCount,
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: "▦" },
    { key: "clients", label: "Clients", icon: "👥" },
    { key: "installments", label: "Installments", icon: "💳" },
  ];

  function handleNav(key) {
    if (key === "dashboard") nav("/admin");
    if (key === "clients") nav("/admin/clients");
    if (key === "installments") nav("/admin/installments");
  }

  return (
    <SidebarLayout
      title="Dashboard"
      subtitle="Avenue 18 - Client Payment Overview"
      navItems={navItems}
      activeKey="dashboard"
      onNav={handleNav}
      user={user}
      onLogout={onLogout}
      children={{
        topRight: (
          <button className="btn" onClick={() => nav("/admin/clients")}>
            👥 Manage Clients
          </button>
        ),
        content: (
          <>
            <div className="grid4">
              <StatCard
                title="Total Clients"
                value={loading ? "…" : stats.totalClients}
                color="#1f4e79"
                icon="👥"
              />
              <StatCard
                title="Amount Received"
                value={loading ? "…" : `Rs. ${stats.received.toLocaleString()}`}
                color="#22c55e"
                icon="✓"
              />
              <StatCard
                title="Pending Amount"
                value={loading ? "…" : `Rs. ${stats.pending.toLocaleString()}`}
                color="#f59e0b"
                icon="⏱"
              />
              <StatCard
                title="Overdue"
                value={loading ? "…" : stats.overdueCount}
                color="#ef4444"
                icon="⚠"
              />
            </div>

            <div className="card" style={{ marginTop: 18, padding: 18 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <h3 style={{ margin: 0 }}>Recent Installments</h3>
                <div
                  style={{
                    color: "#1f4e79",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                  onClick={() => nav("/admin/installments")}
                >
                  View All →
                </div>
              </div>

              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                {recent.map((r, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: "#f3f4f6",
                      borderRadius: 14,
                      padding: 14,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{ display: "flex", gap: 12, alignItems: "center" }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 999,
                          background: "#1f4e79",
                          color: "white",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        📄
                      </div>
                      <div>
                        <div style={{ fontWeight: 800 }}>{r.clientName}</div>
                        <div style={{ color: "#64748b" }}>{r.title}</div>
                      </div>
                    </div>

                    <div
                      style={{ display: "flex", gap: 12, alignItems: "center" }}
                    >
                      <div style={{ fontWeight: 800 }}>
                        Rs. {Number(r.amount).toLocaleString()}
                      </div>
                      <span
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          background:
                            r.status === "Paid" ? "#dcfce7" : "#fef3c7",
                          color: r.status === "Paid" ? "#166534" : "#92400e",
                          fontWeight: 800,
                          fontSize: 12,
                        }}
                      >
                        {r.status}
                      </span>
                    </div>
                  </div>
                ))}
                {recent.length === 0 && (
                  <div style={{ color: "#64748b" }}>
                    No recent installments yet.
                  </div>
                )}
              </div>
            </div>
          </>
        ),
      }}
    />
  );
}
