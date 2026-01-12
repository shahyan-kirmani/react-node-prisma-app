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

/* -------------------- CLIENT CARD -------------------- */
function ClientCard({ c, onEdit, onLedger, onDelete }) {
  const active = (c.status || "Active") === "Active";

  const total = Number(c.totalAmount || 0);
  const down = Number(c.downPayment || 0);
  const posPct = Number(c.possession || 0);
  const months = Number(c.months || 0);

  const possessionAmount = Math.round((total * posPct) / 100);
  const monthlyTotal = Math.max(0, total - down - possessionAmount);
  const monthly = months > 0 ? Math.round(monthlyTotal / months) : 0;

  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div>
          <b style={{ fontSize: 16 }}>{c.clientName}</b>
          <div style={{ color: "#64748b", marginTop: 4 }}>
            {c.unitNumber} • {c.unitType || "Unit"}
          </div>
          <div style={{ color: "#64748b", marginTop: 4 }}>
            {c.project || "Avenue 18"}
          </div>
        </div>

        <span
          style={{
            padding: "6px 10px",
            borderRadius: 999,
            background: active ? "#dcfce7" : "#fee2e2",
            color: active ? "#166534" : "#991b1b",
            fontWeight: 700,
            fontSize: 12,
            height: "fit-content",
          }}
        >
          {c.status || "Active"}
        </span>
      </div>

      <hr
        style={{
          margin: "12px 0",
          border: "none",
          borderTop: "1px solid #e5e7eb",
        }}
      />

      <div style={{ display: "grid", gap: 6 }}>
        <div>
          Total: <b>Rs. {Number(total || 0).toLocaleString()}</b>
        </div>

        <div>
          Down Payment: <b>Rs. {Number(down || 0).toLocaleString()}</b>
        </div>

        <div>
          Possession: <b>{Number(posPct || 0)}%</b>
        </div>

        <div>
          Monthly: <b>Rs. {Number(monthly || 0).toLocaleString()}</b>
        </div>

        <div>
          Duration: <b>{Number(months || 0)} months</b>
        </div>
      </div>

      <div
        style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}
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
          style={{ borderColor: "#fecaca", color: "#991b1b" }}
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

  // ✅ mapping fix: edit click -> normalized values -> setForm
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
        await client.put(
          `/api/admin/clients/${editTarget.contractId}`,
          payload
        );
      }

      setOpen(false);
      await load();
    } catch (e) {
      setMsg(e.response?.data?.error || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // ✅ Delete handler (with confirm)
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

  // optional: delete from inside modal while editing
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
                gridTemplateColumns: "repeat(auto-fit, minmax(320px,1fr))",
                gap: 18,
              }}
            >
              {filtered.map((c) => (
                <ClientCard
                  key={c.contractId}
                  c={c}
                  onEdit={openEdit} // ✅ passes c into openEdit, will map into modal
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
              {/* modal message */}
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
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    placeholder="Enter email"
                  />
                </Field>

                <Field label="Phone" required>
                  <Input
                    value={form.phone}
                    onChange={(e) =>
                      setForm({ ...form, phone: e.target.value })
                    }
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
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value })
                    }
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
                    onChange={(e) =>
                      setForm({ ...form, months: e.target.value })
                    }
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
                {/* ✅ Delete button inside modal (only edit mode) */}
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
                  <button
                    className="btn secondary"
                    onClick={() => setOpen(false)}
                  >
                    Cancel
                  </button>
                  <button className="btn" onClick={submit} disabled={saving}>
                    {saving
                      ? "Saving..."
                      : mode === "create"
                      ? "Add Client"
                      : "Save"}
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
