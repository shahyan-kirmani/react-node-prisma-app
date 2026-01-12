// ✅ ClientLedger.jsx (UPDATED COMPLETE WORKING)
// ✅ Same look
// ✅ Uses responsive classes (pills + header grid)
// ✅ Table remains scrollable on mobile
// ✅ Download buttons + refresh remain same

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import SidebarLayout from "../layout/SidebarLayout";
import { api } from "../api";

const fmt = (n) => `Rs. ${Number(n || 0).toLocaleString("en-PK")}`;

const BACKEND_ORIGIN =
  import.meta?.env?.VITE_API_ORIGIN || "http://localhost:5050";

function fileUrl(u) {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `${BACKEND_ORIGIN}${u.startsWith("/") ? "" : "/"}${u}`;
}

const SURCHARGE_PCT = 5;
const SURCHARGE_GRACE_DAYS = 0;

function toDateOnly(d) {
  if (!d) return null;
  const x = new Date(String(d).slice(0, 10));
  x.setHours(0, 0, 0, 0);
  return x;
}

function isOverdue(dueDate) {
  const due = toDateOnly(dueDate);
  if (!due) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const threshold = new Date(due);
  threshold.setDate(threshold.getDate() + Number(SURCHARGE_GRACE_DAYS || 0));
  return today > threshold;
}

function calcSurcharge(installmentAmount, amountPaid, dueDate) {
  const inst = Number(installmentAmount || 0);
  const paid = Number(amountPaid || 0);
  const outstanding = Math.max(0, inst - paid);

  if (inst <= 0) return 0;
  if (outstanding <= 0) return 0;
  if (!isOverdue(dueDate)) return 0;

  return Math.round((SURCHARGE_PCT / 100) * inst);
}

function Pill({ tone = "gray", children }) {
  const tones = {
    gray: { bg: "#f1f5f9", fg: "#0f172a", bd: "#e2e8f0" },
    green: { bg: "#ecfdf5", fg: "#065f46", bd: "#a7f3d0" },
    orange: { bg: "#fff7ed", fg: "#9a3412", bd: "#fed7aa" },
    blue: { bg: "#eff6ff", fg: "#1d4ed8", bd: "#bfdbfe" },
    red: { bg: "#fef2f2", fg: "#b91c1c", bd: "#fecaca" },
    purple: { bg: "#f5f3ff", fg: "#6d28d9", bd: "#ddd6fe" },
  };
  const t = tones[tone] || tones.gray;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${t.bd}`,
        background: t.bg,
        color: t.fg,
        fontWeight: 800,
        fontSize: 12,
        fontFamily: "Poppins, sans-serif",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function GhostButton({ children, ...props }) {
  return (
    <button
      {...props}
      style={{
        border: "1px solid #e5e7eb",
        padding: "10px 12px",
        borderRadius: 12,
        background: "white",
        color: "#0f172a",
        fontWeight: 900,
        cursor: "pointer",
        transition: "150ms ease",
        fontFamily: "Poppins, sans-serif",
        opacity: props.disabled ? 0.6 : 1,
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

export default function ClientLedger({ token, user, onLogout }) {
  const nav = useNavigate();
  const client = useMemo(() => api(token), [token]);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [contract, setContract] = useState(null);
  const [rows, setRows] = useState([]);

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const res = await client.get("/api/client/ledger");
      setContract(res.data.contract || null);
      setRows(Array.isArray(res.data.rows) ? res.data.rows : []);
    } catch (e) {
      console.error(e);
      setMsg(e.response?.data?.error || "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  async function downloadLedgerPdf() {
    try {
      setMsg("");
      setDownloadingPdf(true);

      const res = await client.get(`/api/client/ledger/export/pdf`, {
        responseType: "blob",
      });

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ledger.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setMsg(e.response?.data?.error || e.message || "Failed to download PDF");
    } finally {
      setDownloadingPdf(false);
    }
  }

  const totalAmount = Number(contract?.totalAmount || 0);
  const downPayment = Number(contract?.downPayment || 0);
  const months = Number(contract?.months || 0);
  const possessionPct = Number(contract?.possession || 0);

  const possessionAmount = Math.round((totalAmount * possessionPct) / 100);
  const monthlyTotal = Math.max(
    0,
    totalAmount - downPayment - possessionAmount
  );

  const totalPayable = Math.round(possessionAmount + monthlyTotal);

  const totalPaid = rows.reduce((sum, r) => sum + Number(r.amountPaid || 0), 0);

  const totalReceivable = rows.reduce((sum, r) => {
    const inst = Number(r.installmentAmount || 0);
    const paid = Number(r.amountPaid || 0);
    return sum + Math.max(0, inst - paid);
  }, 0);

  const totalSurcharge = rows.reduce((sum, r) => {
    return sum + calcSurcharge(r.installmentAmount, r.amountPaid, r.dueDate);
  }, 0);

  const totalReceivableWithSurcharge = totalReceivable + totalSurcharge;

  const navItems = [{ key: "ledger", label: "Ledger", icon: "📒" }];

  function handleNav(key) {
    if (key === "ledger") nav("/client/ledger");
  }

  const msgTone = msg?.includes("✅") ? "green" : "orange";

  return (
    <SidebarLayout
      title="Client Ledger"
      subtitle={
        contract
          ? `${contract.clientName || ""} • ${contract.unitNumber || ""}`
          : ""
      }
      navItems={navItems}
      activeKey="ledger"
      onNav={handleNav}
      user={user}
      onLogout={onLogout}
      children={{
        topRight: (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <GhostButton
              onClick={downloadLedgerPdf}
              disabled={loading || downloadingPdf}
            >
              {downloadingPdf ? "Downloading PDF..." : "⬇ PDF"}
            </GhostButton>

            <GhostButton onClick={load} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </GhostButton>
          </div>
        ),
        content: (
          <div
            className="card"
            style={{
              padding: 14,
              fontFamily: "Poppins, sans-serif",
              background:
                "linear-gradient(180deg, rgba(239,246,255,0.6), rgba(255,255,255,1))",
              borderRadius: 18,
              border: "1px solid #e5e7eb",
            }}
          >
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link
              rel="preconnect"
              href="https://fonts.gstatic.com"
              crossOrigin=""
            />
            <link
              href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap"
              rel="stylesheet"
            />

            {msg && (
              <div style={{ marginBottom: 12 }}>
                <Pill tone={msgTone}>{msg}</Pill>
              </div>
            )}

            {loading ? (
              <div style={{ color: "#64748b", fontWeight: 700 }}>Loading…</div>
            ) : !contract ? (
              <div style={{ color: "#64748b", fontWeight: 700 }}>
                No contract found.
              </div>
            ) : (
              <>
                {/* ✅ Responsive pills row */}
                <div
                  className="ledgerTopRow"
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <div className="ledgerPills">
                    <Pill tone="blue">Payable: {fmt(totalPayable)}</Pill>
                    <Pill tone="green">Paid: {fmt(totalPaid)}</Pill>
                    <Pill tone="orange">
                      Receivable: {fmt(totalReceivable)}
                    </Pill>
                    <Pill tone={totalSurcharge > 0 ? "red" : "purple"}>
                      Surcharge: {fmt(totalSurcharge)}
                    </Pill>
                    <Pill tone="purple">
                      Total Due: {fmt(totalReceivableWithSurcharge)}
                    </Pill>
                  </div>

                  <div
                    style={{ color: "#64748b", fontWeight: 700, fontSize: 12 }}
                  >
                    View-only
                  </div>
                </div>

                {/* ✅ Responsive header cards */}
                <div className="ledgerHeaderGrid" style={{ marginBottom: 14 }}>
                  <div style={panel()}>
                    <div style={label()}>TOTAL AMOUNT</div>
                    <div style={{ fontWeight: 900 }}>{fmt(totalAmount)}</div>
                  </div>

                  <div style={panel()}>
                    <div style={label()}>DOWNPAYMENT</div>
                    <div style={{ fontWeight: 900 }}>{fmt(downPayment)}</div>
                  </div>

                  <div style={panel()}>
                    <div style={label()}>POSSESSION %</div>
                    <div style={{ fontWeight: 900 }}>{possessionPct}%</div>
                  </div>

                  <div style={panel()}>
                    <div style={label()}>MONTHS</div>
                    <div style={{ fontWeight: 900 }}>{months}</div>
                  </div>
                </div>

                {/* TABLE */}
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "separate",
                      borderSpacing: 0,
                      minWidth: 1500,
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: 16,
                      overflow: "hidden",
                      boxShadow: "0 18px 40px rgba(2,6,23,0.06)",
                    }}
                  >
                    <thead>
                      <tr
                        style={{
                          background:
                            "linear-gradient(135deg, #0f172a, #1d4ed8)",
                          color: "white",
                          position: "sticky",
                          top: 0,
                          zIndex: 2,
                        }}
                      >
                        {[
                          "Sr No",
                          "Description",
                          "Installment Amount",
                          "Due Date",
                          "Installment Paid",
                          "Payment Date",
                          "Balance",
                          "Late Payment Surcharge",
                          "Receivable + Surcharge",
                          "Payment Proof",
                        ].map((h, i) => (
                          <th
                            key={i}
                            style={{
                              textAlign: "left",
                              padding: "12px 12px",
                              fontSize: 12,
                              fontWeight: 900,
                              whiteSpace: "nowrap",
                              borderBottom: "1px solid rgba(255,255,255,0.18)",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {rows.map((r, idx) => {
                        const inst = Number(r.installmentAmount || 0);
                        const paid = Number(r.amountPaid || 0);
                        const balance = Math.max(0, inst - paid);

                        const surcharge = calcSurcharge(
                          r.installmentAmount,
                          r.amountPaid,
                          r.dueDate
                        );

                        const receivablePlusSurcharge = balance + surcharge;

                        const proofHref = fileUrl(r.paymentProof);
                        const proofSrc = fileUrl(r.paymentProof);

                        const rowTone =
                          surcharge > 0
                            ? "#fef2f2"
                            : isOverdue(r.dueDate)
                            ? "#fff7ed"
                            : "transparent";

                        return (
                          <tr
                            key={r.id || r.srNo || idx}
                            style={{ background: rowTone }}
                          >
                            <td style={td()}>{r.srNo}</td>
                            <td style={td()}>{r.description || ""}</td>
                            <td style={td()}>{fmt(r.installmentAmount)}</td>
                            <td style={td()}>
                              {r.dueDate ? String(r.dueDate).slice(0, 10) : ""}
                            </td>
                            <td style={td()}>{fmt(r.amountPaid)}</td>
                            <td style={td()}>
                              {r.paymentDate
                                ? String(r.paymentDate).slice(0, 10)
                                : "—"}
                            </td>
                            <td style={td({ fontWeight: 900 })}>
                              <Pill tone={balance > 0 ? "orange" : "green"}>
                                {fmt(balance)}
                              </Pill>
                            </td>
                            <td style={td({ fontWeight: 900 })}>
                              {surcharge > 0 ? (
                                <Pill tone="red">{fmt(surcharge)}</Pill>
                              ) : (
                                <span
                                  style={{ color: "#94a3b8", fontWeight: 800 }}
                                >
                                  —
                                </span>
                              )}
                            </td>
                            <td style={td({ fontWeight: 900 })}>
                              <Pill
                                tone={
                                  receivablePlusSurcharge > 0
                                    ? "purple"
                                    : "green"
                                }
                              >
                                {fmt(receivablePlusSurcharge)}
                              </Pill>
                            </td>
                            <td style={td()}>
                              {r.paymentProof ? (
                                <>
                                  <a
                                    href={proofHref}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      textDecoration: "none",
                                      padding: "10px 12px",
                                      borderRadius: 12,
                                      border: "1px solid #e5e7eb",
                                      background: "#ffffff",
                                      fontWeight: 900,
                                      fontSize: 12,
                                      color: "#0f172a",
                                      whiteSpace: "nowrap",
                                      display: "inline-block",
                                    }}
                                  >
                                    View
                                  </a>

                                  <div style={{ marginTop: 8 }}>
                                    <img
                                      src={proofSrc}
                                      alt="Payment Proof"
                                      style={{
                                        width: 130,
                                        height: 78,
                                        objectFit: "cover",
                                        borderRadius: 14,
                                        border: "1px solid #e5e7eb",
                                      }}
                                      onError={(e) => {
                                        e.currentTarget.style.display = "none";
                                      }}
                                    />
                                  </div>
                                </>
                              ) : (
                                <span
                                  style={{
                                    fontSize: 12,
                                    color: "#64748b",
                                    fontWeight: 700,
                                  }}
                                >
                                  No file
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        ),
      }}
    />
  );
}

function td(extra = {}) {
  return {
    padding: 10,
    borderBottom: "1px solid #eef2f7",
    verticalAlign: "top",
    fontSize: 13,
    ...extra,
  };
}

function panel() {
  return {
    background: "white",
    borderRadius: 16,
    padding: 12,
    border: "1px solid #e5e7eb",
    boxShadow: "0 10px 22px rgba(2, 6, 23, 0.05)",
  };
}

function label() {
  return {
    fontSize: 12,
    fontWeight: 900,
    color: "#0f172a",
    marginBottom: 6,
    letterSpacing: 0.3,
  };
}
