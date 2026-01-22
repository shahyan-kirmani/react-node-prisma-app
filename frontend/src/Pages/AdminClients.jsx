import { useEffect, useMemo, useState } from "react";
import SidebarLayout from "../layout/SidebarLayout";
import { api } from "../api";
import { useNavigate } from "react-router-dom";

/* -------------------- UI HELPERS -------------------- */
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 18,
        zIndex: 9999,
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="card"
        style={{
          width: "min(1100px, 100%)",
          maxHeight: "85vh",
          overflow: "auto",
          padding: 18,
          borderRadius: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn secondary" onClick={onClose}>
            ✕
          </button>
        </div>
        <div style={{ marginTop: 14 }}>{children}</div>
      </div>
    </div>
  );
}

const Field = ({ label, required, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ fontSize: 13, fontWeight: 700 }}>
      {label} {required && <span style={{ color: "#ef4444" }}>*</span>}
    </div>
    {children}
  </div>
);

const Input = (props) => (
  <input
    {...props}
    style={{
      width: "100%",
      padding: 12,
      borderRadius: 10,
      border: "1px solid #e5e7eb",
      outline: "none",
      ...props.style,
    }}
  />
);

const Select = (props) => (
  <select
    {...props}
    style={{
      width: "100%",
      padding: 12,
      borderRadius: 10,
      border: "1px solid #e5e7eb",
      background: "white",
      outline: "none",
      ...props.style,
    }}
  />
);

/* -------------------- NORMALIZE SERVER FIELDS -------------------- */
function normalizeClient(raw) {
  const downPayment =
    raw?.downPayment ??
    raw?.downpayment ??
    raw?.down_payment ??
    raw?.down_payment_amount ??
    raw?.down_payment_amt ??
    0;

  const possession =
    raw?.possession ??
    raw?.possessionPct ??
    raw?.possession_pct ??
    raw?.possession_percent ??
    0;

  const totalAmount =
    raw?.totalAmount ??
    raw?.total_price ??
    raw?.totalPrice ??
    raw?.total ??
    raw?.amount ??
    0;

  const months = raw?.months ?? raw?.duration ?? raw?.tenure ?? 0;

  return {
    ...raw,
    downPayment: Number(downPayment || 0),
    possession: Number(possession || 0),
    totalAmount: Number(totalAmount || 0),
    months: Number(months || 0),
  };
}

/* -------------------- CLIENT CARD (UPGRADED UI) -------------------- */
function ClientCard({ c, onEdit, onLedger, onDelete }) {
  const active = (c.status || "Active") === "Active";

  const total = Number(c.totalAmount || 0);
  const down = Number(c.downPayment || 0);
  const posPct = Number(c.possession || 0);
  const months = Number(c.months || 0);

  const possessionAmount = Math.round((total * posPct) / 100);
  const monthlyTotal = Math.max(0, total - down - possessionAmount);
  const monthly = months > 0 ? Math.round(monthlyTotal / months) : 0;

  const fmt = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;

  /* ===================== INSTALLMENT PROGRESS ===================== */
  // ✅ Option A (recommended): server sends these
  const paidInstallments = Number(c.paidInstallments || 0);
  const totalInstallments =
    Number(c.totalInstallments || 0) || Number(months || 0);

  // ✅ Option B fallback: server sends paidAmount
  const paidAmount = Number(c.paidAmount || 0);

  // Prefer count-based progress, else amount-based
  const progressPct = useMemo(() => {
    if (totalInstallments > 0) {
      return Math.round(
        (Math.max(0, paidInstallments) / totalInstallments) * 100
      );
    }
    if (total > 0) {
      return Math.round((Math.max(0, paidAmount) / total) * 100);
    }
    return 0;
  }, [paidInstallments, totalInstallments, paidAmount, total]);

  const safePct = Math.max(0, Math.min(100, progressPct));

  // Progress label text
  const progressText =
    totalInstallments > 0
      ? `${paidInstallments}/${totalInstallments} installments`
      : `${fmt(paidAmount)} paid`;

  /* ===================== SMALL UI HELPERS ===================== */
  const chip = (text) => (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(148,163,184,.45)",
        background: "rgba(248,250,252,.75)",
        color: "#0f172a",
        fontSize: 12,
        fontWeight: 800,
        lineHeight: 1,
        backdropFilter: "blur(6px)",
      }}
    >
      {text}
    </span>
  );

  // ✅ COLORED STAT BOXES
  const Stat = ({ label, value, tone = "blue" }) => {
    const tones = {
      blue: {
        bg: "linear-gradient(135deg, rgba(37,99,235,.12) 0%, rgba(147,197,253,.18) 100%)",
        border: "rgba(37,99,235,.20)",
        dot: "#2563eb",
      },
      green: {
        bg: "linear-gradient(135deg, rgba(34,197,94,.12) 0%, rgba(134,239,172,.20) 100%)",
        border: "rgba(34,197,94,.20)",
        dot: "#22c55e",
      },
      amber: {
        bg: "linear-gradient(135deg, rgba(245,158,11,.14) 0%, rgba(253,230,138,.22) 100%)",
        border: "rgba(245,158,11,.22)",
        dot: "#f59e0b",
      },
      slate: {
        bg: "linear-gradient(135deg, rgba(15,23,42,.06) 0%, rgba(148,163,184,.18) 100%)",
        border: "rgba(148,163,184,.30)",
        dot: "#334155",
      },
      rose: {
        bg: "linear-gradient(135deg, rgba(244,63,94,.10) 0%, rgba(253,164,175,.20) 100%)",
        border: "rgba(244,63,94,.18)",
        dot: "#f43f5e",
      },
    };

    const t = tones[tone] || tones.blue;

    return (
      <div
        style={{
          padding: "11px 12px",
          borderRadius: 14,
          border: `1px solid ${t.border}`,
          background: t.bg,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -30,
            right: -30,
            width: 90,
            height: 90,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,255,255,.55) 0%, rgba(255,255,255,0) 70%)",
            pointerEvents: "none",
          }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: t.dot,
              boxShadow: "0 6px 14px rgba(15,23,42,.10)",
            }}
          />
          <div style={{ fontSize: 12, color: "#475569", fontWeight: 900 }}>
            {label}
          </div>
        </div>

        <div style={{ fontSize: 15, fontWeight: 900, color: "#0f172a" }}>
          {value}
        </div>
      </div>
    );
  };

  return (
    <div
      className="card"
      style={{
        padding: 18,
        borderRadius: 18,
        border: "1px solid rgba(148,163,184,.35)",
        background:
          "linear-gradient(135deg, rgba(37,99,235,.08) 0%, rgba(16,185,129,.06) 45%, rgba(255,255,255,1) 100%)",
        boxShadow: "0 12px 34px rgba(15, 23, 42, 0.08)",
        transition:
          "transform .15s ease, box-shadow .15s ease, border-color .15s ease",
        position: "relative",
        overflow: "hidden",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 18px 48px rgba(15, 23, 42, 0.12)";
        e.currentTarget.style.borderColor = "rgba(59,130,246,.45)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0px)";
        e.currentTarget.style.boxShadow = "0 12px 34px rgba(15, 23, 42, 0.08)";
        e.currentTarget.style.borderColor = "rgba(148,163,184,.35)";
      }}
    >
      {/* decorative glow */}
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 240,
          height: 240,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(59,130,246,.25) 0%, rgba(59,130,246,0) 70%)",
          pointerEvents: "none",
        }}
      />

      {/* TOP HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 14,
                display: "grid",
                placeItems: "center",
                background:
                  "linear-gradient(135deg, #2563eb 0%, #60a5fa 100%)",
                color: "white",
                fontWeight: 900,
                flex: "0 0 auto",
                boxShadow: "0 10px 20px rgba(37,99,235,.25)",
              }}
              title="Client"
            >
              {(c.clientName || "?").trim().charAt(0).toUpperCase()}
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 900,
                  color: "#0f172a",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={c.clientName}
              >
                {c.clientName}
              </div>

              <div
                style={{
                  marginTop: 6,
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {chip(`${c.unitNumber} • ${c.unitType || "Unit"}`)}
                {chip(c.project || "Avenue 18")}
              </div>
            </div>
          </div>
        </div>

        <span
          style={{
            padding: "7px 12px",
            borderRadius: 999,
            background: active ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.12)",
            color: active ? "#166534" : "#991b1b",
            fontWeight: 900,
            fontSize: 12,
            height: "fit-content",
            border: `1px solid ${
              active ? "rgba(34,197,94,.25)" : "rgba(239,68,68,.25)"
            }`,
            flex: "0 0 auto",
          }}
        >
          {c.status || "Active"}
        </span>
      </div>

      {/* ✅ INSTALLMENT PROGRESS */}
      <div style={{ marginTop: 14 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 900, color: "#334155" }}>
            Installment Progress
          </div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#0f172a" }}>
            {safePct}% • {progressText}
          </div>
        </div>

        <div
          style={{
            width: "100%",
            height: 12,
            borderRadius: 999,
            background: "rgba(99,102,241,.10)",
            border: "1px solid rgba(148,163,184,.35)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${safePct}%`,
              height: "100%",
              background:
                safePct >= 70
                  ? "linear-gradient(90deg, #22c55e 0%, #86efac 100%)"
                  : safePct >= 35
                  ? "linear-gradient(90deg, #2563eb 0%, #93c5fd 100%)"
                  : "linear-gradient(90deg, #f59e0b 0%, #fde68a 100%)",
              transition: "width .25s ease",
            }}
          />
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#64748b", fontWeight: 700 }}>
          More paid installments → bar fills automatically.
        </div>
      </div>

      {/* STATS GRID (COLORED) */}
      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <Stat label="Total" value={fmt(total)} tone="blue" />
        <Stat label="Monthly" value={fmt(monthly)} tone="green" />
        <Stat label="Down Payment" value={fmt(down)} tone="amber" />
        <Stat label="Duration" value={`${months} months`} tone="slate" />
      </div>

      {/* ACTIONS */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 14,
          flexWrap: "wrap",
          justifyContent: "flex-end",
        }}
      >
        <button className="btn secondary" onClick={() => onEdit(c)}>
          ✎ Edit
        </button>

        <button className="btn" onClick={() => onLedger(c)}>
          👁 Ledger
        </button>

        <button
          className="btn secondary"
          onClick={() => onDelete(c)}
          style={{
            borderColor: "#fecaca",
            color: "#991b1b",
            background: "#fff1f2",
          }}
          title="Delete client"
        >
          🗑 Delete
        </button>
      </div>
    </div>
  );
}

/* -------------------- MAIN PAGE -------------------- */
export default function AdminClients({ token, user, onLogout }) {
  const nav = useNavigate();
  const client = useMemo(() => api(token), [token]);

  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("create");
  const [editTarget, setEditTarget] = useState(null);
  const [msg, setMsg] = useState("");

  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    cnic: "",
    password: "",
    project: "Avenue 18",
    unitNumber: "",
    unitType: "Apartment",
    status: "Active",
    totalPrice: "",
    downPayment: "",
    possession: "",
    months: "",
    bookingDate: "",
  });

  async function load() {
    const res = await client.get("/api/admin/clients");
    const list = Array.isArray(res.data) ? res.data : [];
    setClients(list.map(normalizeClient));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, []);

  function openCreate() {
    setMode("create");
    setEditTarget(null);
    setMsg("");
    setForm({
      fullName: "",
      email: "",
      phone: "",
      cnic: "",
      password: "",
      project: "Avenue 18",
      unitNumber: "",
      unitType: "Apartment",
      status: "Active",
      totalPrice: "",
      downPayment: "",
      possession: "",
      months: "",
      bookingDate: "",
    });
    setOpen(true);
  }

  function openEdit(rawC) {
    const c = normalizeClient(rawC);

    setMode("edit");
    setEditTarget(c);
    setMsg("");

    setForm({
      fullName: c.clientName || "",
      email: c.email || "",
      phone: c.phone || "",
      cnic: c.cnic || "",
      password: "",

      project: c.project || "Avenue 18",
      unitNumber: c.unitNumber || "",
      unitType: c.unitType || "Apartment",
      status: c.status || "Active",

      totalPrice: String(c.totalAmount || ""),
      downPayment: String(c.downPayment || 0),
      possession: String(c.possession || 0),
      months: String(c.months || ""),
      bookingDate: c.bookingDate?.slice(0, 10) || "",
    });

    setOpen(true);
  }

  async function submit() {
    setMsg("");

    if (
      !form.fullName ||
      !form.email ||
      !form.phone ||
      !form.unitNumber ||
      !form.totalPrice ||
      !form.months ||
      (mode === "create" && !form.password)
    ) {
      setMsg("Please fill all required fields (*)");
      return;
    }

    try {
      setSaving(true);

      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        cnic: form.cnic ? form.cnic.trim() : null,

        project: form.project || "Avenue 18",
        unitNumber: form.unitNumber.trim(),
        unitType: form.unitType,
        status: form.status,

        totalAmount: Number(form.totalPrice),
        downPayment: Number(form.downPayment || 0),
        possession: Number(form.possession || 0),
        months: Number(form.months),
        bookingDate: form.bookingDate ? form.bookingDate : null,
      };

      if (mode === "create") {
        await client.post("/api/admin/clients", {
          ...payload,
          password: form.password,
        });
      } else {
        await client.put(`/api/admin/clients/${editTarget.contractId}`, payload);
      }

      setOpen(false);
      await load();
    } catch (e) {
      setMsg(e.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function deleteClient(rawC) {
    const c = normalizeClient(rawC);
    const ok = window.confirm(
      `Delete this client?\n\n${c.clientName || ""} • ${
        c.unitNumber || ""
      }\n\nThis action cannot be undone.`
    );
    if (!ok) return;

    setMsg("");
    setDeleting(true);
    try {
      await client.delete(`/api/admin/clients/${c.contractId}`);
      await load();
      setMsg("Client deleted ✅");
    } catch (e) {
      setMsg(e.response?.data?.error || "Failed to delete client");
    } finally {
      setDeleting(false);
    }
  }

  async function deleteFromModal() {
    if (!editTarget?.contractId) return;
    await deleteClient(editTarget);
    setOpen(false);
  }

  const filtered = clients.filter((c) =>
    `${c.clientName} ${c.unitNumber} ${c.email} ${c.phone} ${c.cnic || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  return (
    <SidebarLayout
      title="Clients"
      subtitle="Manage Avenue 18 Clients"
      navItems={[
        { key: "dashboard", label: "Dashboard", icon: "▦" },
        { key: "clients", label: "Clients", icon: "👥" },
        { key: "installments", label: "Installments", icon: "💳" },
      ]}
      activeKey="clients"
      onNav={(k) => nav(`/admin/${k === "dashboard" ? "" : k}`)}
      user={user}
      onLogout={onLogout}
      children={{
        topRight: (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn" onClick={openCreate} disabled={deleting}>
              ＋ Add Client
            </button>
            {deleting && (
              <span style={{ color: "#64748b", fontWeight: 700 }}>
                Deleting...
              </span>
            )}
          </div>
        ),
        content: (
          <>
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ marginBottom: 16 }}
            />

            {msg && (
              <div
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 10,
                  background: msg.includes("✅") ? "#ecfdf5" : "#fff7ed",
                  border: msg.includes("✅")
                    ? "1px solid #a7f3d0"
                    : "1px solid #fed7aa",
                  color: msg.includes("✅") ? "#065f46" : "#9a3412",
                  fontWeight: 700,
                }}
              >
                {msg}
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(360px,1fr))",
                gap: 18,
                alignItems: "start",
              }}
            >
              {filtered.map((c) => (
                <ClientCard
                  key={c.contractId}
                  c={c}
                  onEdit={openEdit}
                  onLedger={() => nav(`/admin/ledger/${c.contractId}`)}
                  onDelete={deleteClient}
                />
              ))}
            </div>

            <Modal
              open={open}
              onClose={() => setOpen(false)}
              title={mode === "create" ? "Add Client" : "Edit Client"}
            >
              {msg && (
                <div
                  style={{
                    marginBottom: 12,
                    padding: 12,
                    borderRadius: 10,
                    background: "#fff7ed",
                    border: "1px solid #fed7aa",
                    color: "#9a3412",
                    fontWeight: 700,
                  }}
                >
                  {msg}
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                <Field label="Full Name" required>
                  <Input
                    value={form.fullName}
                    onChange={(e) =>
                      setForm({ ...form, fullName: e.target.value })
                    }
                    placeholder="Enter full name"
                  />
                </Field>

                <Field label="Email" required>
                  <Input
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="Enter email"
                  />
                </Field>

                <Field label="Phone" required>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Enter phone number"
                  />
                </Field>

                <Field label="CNIC">
                  <Input
                    value={form.cnic}
                    onChange={(e) => setForm({ ...form, cnic: e.target.value })}
                    placeholder="Enter CNIC"
                  />
                </Field>

                {mode === "create" && (
                  <>
                    <Field label="Password" required>
                      <Input
                        type="password"
                        value={form.password}
                        onChange={(e) =>
                          setForm({ ...form, password: e.target.value })
                        }
                        placeholder="Enter password"
                      />
                    </Field>
                    <div />
                  </>
                )}

                <Field label="Project">
                  <Select
                    value={form.project}
                    onChange={(e) =>
                      setForm({ ...form, project: e.target.value })
                    }
                  >
                    <option value="Avenue 18">Avenue 18</option>
                  </Select>
                </Field>

                <Field label="Status">
                  <Select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </Select>
                </Field>

                <Field label="Unit Number" required>
                  <Input
                    value={form.unitNumber}
                    onChange={(e) =>
                      setForm({ ...form, unitNumber: e.target.value })
                    }
                    placeholder="e.g., A-101"
                  />
                </Field>

                <Field label="Unit Type">
                  <Select
                    value={form.unitType}
                    onChange={(e) =>
                      setForm({ ...form, unitType: e.target.value })
                    }
                  >
                    <option>Apartment</option>
                    <option>Shop</option>
                    <option>Office</option>
                    <option>Food Court</option>
                  </Select>
                </Field>

                <Field label="Total Price (Rs.)" required>
                  <Input
                    type="number"
                    value={form.totalPrice}
                    onChange={(e) =>
                      setForm({ ...form, totalPrice: e.target.value })
                    }
                    placeholder="Enter total price"
                  />
                </Field>

                <Field label="Down Payment (Rs.)">
                  <Input
                    type="number"
                    value={form.downPayment}
                    onChange={(e) =>
                      setForm({ ...form, downPayment: e.target.value })
                    }
                    placeholder="Enter down payment"
                  />
                </Field>

                <Field label="Possession (%)">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={form.possession}
                    onChange={(e) =>
                      setForm({ ...form, possession: e.target.value })
                    }
                    placeholder="e.g., 10"
                  />
                </Field>

                <Field label="Months" required>
                  <Input
                    type="number"
                    value={form.months}
                    onChange={(e) => setForm({ ...form, months: e.target.value })}
                    placeholder="e.g., 36"
                  />
                </Field>

                <Field label="Booking Date">
                  <Input
                    type="date"
                    value={form.bookingDate}
                    onChange={(e) =>
                      setForm({ ...form, bookingDate: e.target.value })
                    }
                  />
                </Field>
                <div />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 16,
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                {mode === "edit" ? (
                  <button
                    className="btn secondary"
                    onClick={deleteFromModal}
                    disabled={deleting}
                    style={{ borderColor: "#fecaca", color: "#991b1b" }}
                  >
                    {deleting ? "Deleting..." : "🗑 Delete Client"}
                  </button>
                ) : (
                  <div />
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn secondary" onClick={() => setOpen(false)}>
                    Cancel
                  </button>
                  <button className="btn" onClick={submit} disabled={saving}>
                    {saving ? "Saving..." : mode === "create" ? "Add Client" : "Save"}
                  </button>
                </div>
              </div>
            </Modal>
          </>
        ),
      }}
    />
  );
}
