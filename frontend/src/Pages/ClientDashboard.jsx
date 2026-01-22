// ✅ ClientLedger.jsx (RESPONSIVE TABLE ON MOBILE + CHILD ROWS + LOCKED SURCHARGE)
// ✅ Desktop + Mobile: SAME TABLE (horizontal scroll on mobile)
// ✅ Uses backend locked surcharge: r.latePaymentSurcharge (NO recalculation)

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
  return today > due;
}

function childPaidSum(row) {
  const children = row?.children || [];
  return children.reduce((s, c) => s + Number(c.amountPaid || 0), 0);
}

function effectivePaid(row) {
  return Number(row?.amountPaid || 0) + childPaidSum(row);
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

function MiniActionLink({ href, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
        textDecoration: "none",
        padding: "9px 12px",
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
      {label}
    </a>
  );
}

function ProofThumb({ src, alt = "Proof" }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      style={{
        width: "100%",
        maxWidth: 220,
        height: "auto",
        aspectRatio: "16 / 9",
        objectFit: "cover",
        borderRadius: 14,
        border: "1px solid #e5e7eb",
        display: "block",
      }}
      onError={(e) => {
        e.currentTarget.style.display = "none";
      }}
    />
  );
}

function ChildRows({ childrenRows }) {
  const rows = Array.isArray(childrenRows) ? childrenRows : [];
  if (!rows.length) return null;

  return (
    <div
      style={{
        marginTop: 10,
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        overflow: "hidden",
        background: "#ffffff",
      }}
    >
      <div
        style={{
          padding: "10px 12px",
          fontWeight: 900,
          fontSize: 12,
          color: "#0f172a",
          background: "linear-gradient(180deg, #f8fafc, #ffffff)",
          borderBottom: "1px solid #eef2f7",
        }}
      >
        Child Payments
      </div>

      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 680 }}>
          <thead>
            <tr>
              {["Line", "Description", "Paid", "Payment Date", "Proof"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    fontSize: 12,
                    fontWeight: 900,
                    color: "#334155",
                    borderBottom: "1px solid #eef2f7",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c, idx) => {
              const proofHref = fileUrl(c.paymentProof);
              const proofSrc = fileUrl(c.paymentProof);

              return (
                <tr key={c.id || c.lineNo || idx}>
                  <td style={td()}>{c.lineNo || "—"}</td>
                  <td style={td()}>{c.description || "—"}</td>
                  <td style={td({ fontWeight: 900 })}>{fmt(c.amountPaid || 0)}</td>
                  <td style={td()}>{c.paymentDate ? String(c.paymentDate).slice(0, 10) : "—"}</td>
                  <td style={td()}>
                    {c.paymentProof ? (
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <MiniActionLink href={proofHref} label="View" />
                        <ProofThumb src={proofSrc} alt="Child Proof" />
                      </div>
                    ) : (
                      <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>No file</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
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

  const [openRows, setOpenRows] = useState(() => new Set());

  function toggleOpen(key) {
    setOpenRows((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const res = await client.get("/api/client/ledger");
      const contractData = res.data.contract || null;
      const rowsData = Array.isArray(res.data.rows) ? res.data.rows : [];

      setContract(contractData);
      setRows(rowsData);

      const auto = new Set();
      for (const r of rowsData) {
        if (Array.isArray(r.children) && r.children.length > 0) {
          auto.add(r.id || r.srNo);
        }
      }
      setOpenRows(auto);
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
  const monthlyTotal = Math.max(0, totalAmount - downPayment - possessionAmount);
  const totalPayable = Math.round(possessionAmount + monthlyTotal);

  const totalPaid = rows.reduce((sum, r) => sum + effectivePaid(r), 0);

  const totalReceivable = rows.reduce((sum, r) => {
    const inst = Number(r.installmentAmount || 0);
    const paidAll = effectivePaid(r);
    return sum + Math.max(0, inst - paidAll);
  }, 0);

  const totalSurcharge = rows.reduce((sum, r) => sum + Number(r.latePaymentSurcharge || 0), 0);
  const totalReceivableWithSurcharge = totalReceivable + totalSurcharge;

  const navItems = [{ key: "ledger", label: "Ledger", icon: "📒" }];

  function handleNav(key) {
    if (key === "ledger") nav("/client/ledger");
  }

  const msgTone = msg?.includes("✅") ? "green" : "orange";

  return (
    <SidebarLayout
      title="Client Ledger"
      subtitle={contract ? `${contract.clientName || ""} • ${contract.unitNumber || ""}` : ""}
      navItems={navItems}
      activeKey="ledger"
      onNav={handleNav}
      user={user}
      onLogout={onLogout}
      children={{
        topRight: (
          <div className="ledgerTopActions">
            <GhostButton onClick={downloadLedgerPdf} disabled={loading || downloadingPdf}>
              {downloadingPdf ? "Downloading PDF..." : "⬇ PDF"}
            </GhostButton>

            <GhostButton onClick={load} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </GhostButton>
          </div>
        ),
        content: (
          <div className="ledgerWrap card">
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
            <link
              href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap"
              rel="stylesheet"
            />

            {/* ✅ Responsive CSS (TABLE STAYS ON MOBILE) */}
            <style>{`
              .ledgerWrap{
                padding:14px;
                font-family:Poppins, sans-serif;
                background:linear-gradient(180deg, rgba(239,246,255,0.65), rgba(255,255,255,1));
                border-radius:18px;
                border:1px solid #e5e7eb;
              }
              .ledgerPills{ display:flex; flex-wrap:wrap; gap:10px; min-width:0; }
              .ledgerTopRow{
                display:flex; flex-wrap:wrap; gap:10px; align-items:center;
                justify-content:space-between; margin-bottom:12px; min-width:0;
              }
              .ledgerTopActions{ display:flex; gap:10px; flex-wrap:wrap; }

              .ledgerHeaderGrid{
                display:grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap:12px;
                margin-bottom:14px;
              }

              .ledgerTableWrap{
                overflow-x:auto;
                -webkit-overflow-scrolling: touch;
                border-radius:16px;
              }

              /* ✅ Tablet */
              @media (max-width: 1024px){
                .ledgerHeaderGrid{ grid-template-columns: repeat(2, minmax(0, 1fr)); }
              }

              /* ✅ Mobile: keep table, just reduce padding/font */
              @media (max-width: 720px){
                .ledgerTopRow{ flex-direction:column; align-items:flex-start; }
                .ledgerTopActions{ width:100%; }
                .ledgerTopActions button{ flex:1; width:100%; }
                .ledgerPills{ gap:8px; }

                .thSm{ padding:10px 10px !important; font-size:11px !important; }
                .tdSm{ padding:8px 10px !important; font-size:12px !important; }
              }

              /* ✅ Small mobile: header panels single column */
              @media (max-width: 560px){
                .ledgerWrap{ padding:12px; }
                .ledgerHeaderGrid{ grid-template-columns: 1fr; }
              }
            `}</style>

            {msg && (
              <div style={{ marginBottom: 12 }}>
                <Pill tone={msgTone}>{msg}</Pill>
              </div>
            )}

            {loading ? (
              <div style={{ color: "#64748b", fontWeight: 700 }}>Loading…</div>
            ) : !contract ? (
              <div style={{ color: "#64748b", fontWeight: 700 }}>No contract found.</div>
            ) : (
              <>
                {/* ✅ Pills */}
                <div className="ledgerTopRow">
                  <div className="ledgerPills">
                    <Pill tone="blue">Payable: {fmt(totalPayable)}</Pill>
                    <Pill tone="green">Paid: {fmt(totalPaid)}</Pill>
                    <Pill tone="orange">Receivable: {fmt(totalReceivable)}</Pill>
                    <Pill tone={totalSurcharge > 0 ? "red" : "purple"}>
                      Surcharge: {fmt(totalSurcharge)}
                    </Pill>
                    <Pill tone="purple">Total Due: {fmt(totalReceivableWithSurcharge)}</Pill>
                  </div>

                  <div style={{ color: "#64748b", fontWeight: 700, fontSize: 12 }}>
                    View-only
                  </div>
                </div>

                {/* ✅ Header panels */}
                <div className="ledgerHeaderGrid">
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

                {/* ✅ SAME TABLE FOR MOBILE + DESKTOP */}
                <div className="ledgerTableWrap">
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "separate",
                      borderSpacing: 0,
                      minWidth: 1200, // ✅ allows horizontal scroll on small screens
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
                          background: "linear-gradient(135deg, #0f172a, #1d4ed8)",
                          color: "white",
                        }}
                      >
                        {[
                          "",
                          "Sr No",
                          "Description",
                          "Installment Amount",
                          "Due Date",
                          "Paid (Parent + Child)",
                          "Payment Date",
                          "Balance",
                          "Late Payment Surcharge",
                          "Receivable + Surcharge",
                          "Payment Proof",
                        ].map((h, i) => (
                          <th
                            key={i}
                            className="thSm"
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
                        const paidAll = effectivePaid(r);
                        const balance = Math.max(0, inst - paidAll);

                        const surcharge = Number(r.latePaymentSurcharge || 0);
                        const receivablePlusSurcharge = balance + surcharge;

                        const proofHref = fileUrl(r.paymentProof);
                        const proofSrc = fileUrl(r.paymentProof);

                        const hasChildren = (r?.children || []).length > 0;
                        const key = r.id || r.srNo || idx;
                        const isOpen = openRows.has(key);

                        const rowTone =
                          surcharge > 0
                            ? "#fef2f2"
                            : isOverdue(r.dueDate)
                            ? "#fff7ed"
                            : "transparent";

                        return (
                          <>
                            <tr key={`p-${key}`} style={{ background: rowTone }}>
                              <td className="tdSm" style={td({ width: 44 })}>
                                {hasChildren ? (
                                  <button
                                    onClick={() => toggleOpen(key)}
                                    style={{
                                      width: 32,
                                      height: 32,
                                      borderRadius: 10,
                                      border: "1px solid #e5e7eb",
                                      background: "white",
                                      cursor: "pointer",
                                      fontWeight: 900,
                                    }}
                                    title={isOpen ? "Hide child rows" : "Show child rows"}
                                  >
                                    {isOpen ? "▾" : "▸"}
                                  </button>
                                ) : (
                                  <span style={{ color: "#cbd5e1", fontWeight: 900 }}>—</span>
                                )}
                              </td>

                              <td className="tdSm" style={td()}>{r.srNo}</td>
                              <td className="tdSm" style={td()}>{r.description || ""}</td>
                              <td className="tdSm" style={td()}>{fmt(inst)}</td>
                              <td className="tdSm" style={td()}>{r.dueDate ? String(r.dueDate).slice(0, 10) : ""}</td>

                              <td className="tdSm" style={td({ fontWeight: 900 })}>
                                <Pill tone={paidAll > 0 ? "green" : "gray"}>{fmt(paidAll)}</Pill>
                              </td>

                              <td className="tdSm" style={td()}>
                                {r.paymentDate ? String(r.paymentDate).slice(0, 10) : "—"}
                              </td>

                              <td className="tdSm" style={td({ fontWeight: 900 })}>
                                <Pill tone={balance > 0 ? "orange" : "green"}>{fmt(balance)}</Pill>
                              </td>

                              <td className="tdSm" style={td({ fontWeight: 900 })}>
                                {surcharge > 0 ? (
                                  <Pill tone="red">{fmt(surcharge)}</Pill>
                                ) : (
                                  <span style={{ color: "#94a3b8", fontWeight: 800 }}>—</span>
                                )}
                              </td>

                              <td className="tdSm" style={td({ fontWeight: 900 })}>
                                <Pill tone={receivablePlusSurcharge > 0 ? "purple" : "green"}>
                                  {fmt(receivablePlusSurcharge)}
                                </Pill>
                              </td>

                              <td className="tdSm" style={td()}>
                                {r.paymentProof ? (
                                  <>
                                    <MiniActionLink href={proofHref} label="View" />
                                    <div style={{ marginTop: 8 }}>
                                      <ProofThumb src={proofSrc} alt="Payment Proof" />
                                    </div>
                                  </>
                                ) : (
                                  <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
                                    No file
                                  </span>
                                )}
                              </td>
                            </tr>

                            {hasChildren && isOpen && (
                              <tr key={`c-${key}`}>
                                <td colSpan={11} style={{ padding: 12, background: "#ffffff" }}>
                                  <ChildRows childrenRows={r.children} />
                                </td>
                              </tr>
                            )}
                          </>
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
