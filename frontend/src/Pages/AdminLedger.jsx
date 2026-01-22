import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import SidebarLayout from "../layout/SidebarLayout";
import { api } from "../api";


// ✅ Drag & Drop libs
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const fmt = (n) => `Rs. ${Number(n || 0).toLocaleString("en-PK")}`;

const BACKEND_ORIGIN =
  import.meta?.env?.VITE_API_ORIGIN || "http://localhost:5050";

function fileUrl(u) {
  if (!u) return "";
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  return `${BACKEND_ORIGIN}${u.startsWith("/") ? "" : "/"}${u}`;
}

// ===================== SURCHARGE SETTINGS =====================
const SURCHARGE_PCT = 5;
const SURCHARGE_AFTER_DAYS = 30;
const DAILY_SURCHARGE_PCT = 0.16; // (kept, not used in your UI currently)

// ✅ Today in Pakistan timezone (fixes date shift issues)
function todayPKDateOnly() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const y = Number(parts.find((p) => p.type === "year")?.value || "1970");
  const m = Number(parts.find((p) => p.type === "month")?.value || "01") - 1;
  const d = Number(parts.find((p) => p.type === "day")?.value || "01");

  const x = new Date(y, m, d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// ✅ Parse YYYY-MM-DD safely (no timezone shift)
function toDateOnly(d) {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const day = Number(m[3]);
    const x = new Date(y, mo, day);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// ✅ Late days = (paymentDate if exists else todayPK) - dueDate
function lateDays(dueDate, paymentDate) {
  const due = toDateOnly(dueDate);
  if (!due) return 0;

  const end = paymentDate ? toDateOnly(paymentDate) : todayPKDateOnly();
  if (!end) return 0;

  const diffMs = end.getTime() - due.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

// ✅ Late days = (paymentDate if exists else todayPK) - dueDate


// ✅ If balance is still pending, keep counting late days till TODAY.
// If fully paid, stop counting at the latest payment date.
// ✅ Always count late days till TODAY (so next 30-day cycle can add again)
// Locked surcharge will never decrease anyway.
// ✅ Late days ONLY when payment date exists (first surcharge requires both dates)
function lateDaysWhenPaid(dueDate, paymentDate) {
  if (!dueDate) return 0;
  // ✅ if payment date missing, still count till TODAY
  return lateDays(dueDate, paymentDate || "");
}




// ✅ surcharge cycles count: 0-29 =>0, 30-59=>1, 60-89=>2 ...


// ✅ surcharge cycles count: 0-29 =>0, 30-59=>1, 60-89=>2 ...
function cyclesFromLateDays(days) {
  return Math.floor(Math.max(0, Number(days || 0)) / SURCHARGE_AFTER_DAYS);
}

function sumBlocks(blocks) {
  return (blocks || []).reduce((s, b) => s + Number(b.amount || 0), 0);
}

function splitLateDays(days) {
  const fullCycles = Math.floor(Math.max(0, days) / SURCHARGE_AFTER_DAYS);
  const rem = Math.max(0, days) % SURCHARGE_AFTER_DAYS;
  return { fullCycles, rem };
}

function makeBlock({ cycle, balance }) {
  const amount = balance > 0 ? Math.round((SURCHARGE_PCT / 100) * balance) : 0;
  return {
    cycle,
    daysFrom: (cycle - 1) * SURCHARGE_AFTER_DAYS + 1,
    daysTo: cycle * SURCHARGE_AFTER_DAYS,
    amount,
    balanceAtLock: Math.round(balance),
    lockedAt: new Date().toISOString().slice(0, 10),
  };
}


function ordinal(n) {
  const s = ["th", "st", "nd", "rd"],
    v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * ✅ CHILD PAYMENTS HELPERS
 * Balance / totals / surcharge should consider:
 * parent.amountPaid + sum(children.amountPaid)
 */
function childPaidSum(row) {
  const children = row?.children || [];
  return children.reduce((sum, c) => sum + Number(c.amountPaid || 0), 0);
}

function effectivePaid(row) {
  return Number(row?.amountPaid || 0) + childPaidSum(row);
}

// latest payment date among parent + children (YYYY-MM-DD)
function effectivePaymentDate(row) {
  const dates = [];
  if (row?.paymentDate) dates.push(String(row.paymentDate).slice(0, 10));
  const children = row?.children || [];
  for (const c of children) {
    if (c?.paymentDate) dates.push(String(c.paymentDate).slice(0, 10));
  }
  if (!dates.length) return "";
  dates.sort(); // lex sort works for YYYY-MM-DD
  return dates[dates.length - 1];
}

// ✅ Balance display rule you want:
// - Before any payment => 0
// - After any payment => show remaining
function displayBalanceForRow(row) {
  const inst = Number(row?.installmentAmount || 0);
  const paid = effectivePaid(row); // parent + children
  const remaining = Math.max(0, inst - paid);

  return paid > 0 ? remaining : 0;
}


function computeRowSurchargeDisplay(row) {
  const inst = Number(row.installmentAmount || 0);

  // ✅ cycles depend on latest payment date (preview ok)
  const payDate = effectivePaymentDate(row);
  const daysLate = lateDaysWhenPaid(row.dueDate, payDate);
  const previewCycles = cyclesFromLateDays(daysLate);

  // ✅ base snapshot from DB / last save
  const baseCycles = Number(row.surchargeCyclesBase || 0);
  const baseLocked = Number(row.surchargeLockedBase || 0);

  // ✅ THIS is the key:
  // after first cycle, surcharge should be calculated on SAVED BALANCE, not the balance you just typed.
  const savedBalance = Number(
    row.surchargeBalanceBase ?? inst
  );

  const extraCycles = Math.max(0, previewCycles - baseCycles);

  // ✅ per-cycle base amount rule:
  // - cycle #1 => installment amount
  // - cycle #2+ => saved balance snapshot
  let previewAdd = 0;
  if (extraCycles > 0) {
    const hasSavedPayment = savedBalance < inst;

for (let c = baseCycles + 1; c <= previewCycles; c++) {
  const baseForThisCycle =
    !hasSavedPayment ? inst : c === 1 ? inst : savedBalance;

  previewAdd += baseForThisCycle > 0
    ? Math.round((SURCHARGE_PCT / 100) * baseForThisCycle)
    : 0;
}

  }

  return {
    daysLate,
    cycles: previewCycles,
    surcharge: baseLocked + previewAdd,
    baseLocked,
    previewAdd,
  };
}


function computePossessionSurchargeDisplay({
  possessionAmount,
  posPaid,
  posDueDate,
  posPaymentDate,
  posSurchargeLockedAmountBase,
  posSurchargeCyclesBase,
}) {
  const inst = Number(possessionAmount || 0);
  const paidAll = Number(posPaid || 0);

  // ✅ Balance display rule (same as your installment rule):
  // - before any payment => 0
  // - after some payment => show remaining
  const balance = paidAll > 0 ? Math.max(0, inst - paidAll) : 0;

  const daysLate = lateDaysWhenPaid(posDueDate, posPaymentDate);
  const previewCycles = cyclesFromLateDays(daysLate);

  const baseLocked = Number(posSurchargeLockedAmountBase || 0);
  const baseCycles = Number(posSurchargeCyclesBase || 0);

  const extraCycles = Math.max(0, previewCycles - baseCycles);

  const previewAdd =
    extraCycles > 0 && balance > 0
      ? Math.round((SURCHARGE_PCT / 100) * balance) * extraCycles
      : 0;

  return {
    daysLate,
    cycles: previewCycles,
    surcharge: baseLocked + previewAdd,
    baseLocked,
    previewAdd,
    balance,
  };
}



function Input(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        outline: "none",
        background: props.disabled ? "#f1f5f9" : "#ffffff",
        boxShadow: "0 1px 0 rgba(2, 6, 23, 0.04)",
        transition: "150ms ease",
        fontFamily: "Poppins, sans-serif",
        fontSize: 13,
        ...props.style,
      }}
    />
  );
}

function Select(props) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #e5e7eb",
        outline: "none",
        background: props.disabled ? "#f1f5f9" : "#ffffff",
        boxShadow: "0 1px 0 rgba(2, 6, 23, 0.04)",
        transition: "150ms ease",
        fontFamily: "Poppins, sans-serif",
        fontSize: 13,
        ...props.style,
      }}
    />
  );
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

function PrimaryButton({ children, ...props }) {
  return (
    <button
      {...props}
      style={{
        border: "0",
        padding: "10px 14px",
        borderRadius: 12,
        background: "linear-gradient(135deg, #2563eb, #7c3aed)",
        color: "white",
        fontWeight: 900,
        cursor: "pointer",
        boxShadow: "0 10px 20px rgba(37, 99, 235, 0.18)",
        transition: "150ms ease",
        fontFamily: "Poppins, sans-serif",
        ...props.style,
      }}
    >
      {children}
    </button>
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
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

function DangerButton({ children, ...props }) {
  return (
    <button
      {...props}
      style={{
        border: "1px solid #fecaca",
        padding: "10px 12px",
        borderRadius: 12,
        background: "#fef2f2",
        color: "#b91c1c",
        fontWeight: 900,
        cursor: "pointer",
        transition: "150ms ease",
        fontFamily: "Poppins, sans-serif",
        ...props.style,
      }}
    >
      {children}
    </button>
  );
}

/**
 * ✅ Sortable row wrapper (drag handle)
 * We drag by the handle only, so inputs remain usable.
 */
function SortableRow({ row, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.__key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    background: isDragging ? "#eef2ff" : "transparent",
    boxShadow: isDragging ? "0 12px 26px rgba(2, 6, 23, 0.12)" : "none",
  };

  return (
    <tr ref={setNodeRef} style={style}>
      {/* Drag Handle Cell */}
      <td style={td({ width: 48 })}>
        <div
          {...attributes}
          {...listeners}
          title="Drag to reorder"
          style={{
            cursor: "grab",
            userSelect: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 40,
            width: 36,
            borderRadius: 12,
            border: "1px solid #e5e7eb",
            background:
              "linear-gradient(180deg, rgba(255,255,255,1), rgba(248,250,252,1))",
            fontWeight: 900,
            color: "#0f172a",
          }}
        >
          ☰
        </div>
      </td>

      {children}
    </tr>
  );
}

export default function AdminLedger({ token, user, onLogout }) {
  const nav = useNavigate();
  const { contractId } = useParams();
  console.log("contractId from URL:", contractId);

  const client = useMemo(() => api(token), [token]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const [contract, setContract] = useState(null);
  const [rows, setRows] = useState([]);

  // ✅ expanded child sections (by __key)
  const [expandedKeys, setExpandedKeys] = useState(() => new Set());

  const [totalAmountEdit, setTotalAmountEdit] = useState(0);
  const [downPaymentEdit, setDownPaymentEdit] = useState(0);
  const [possessionPctEdit, setPossessionPctEdit] = useState(0);
  const [monthsEdit, setMonthsEdit] = useState(0);

  // ✅ POSSESSION editable fields (now it behaves like a real row)
  const [posDueDate, setPosDueDate] = useState("");
  const [posPaid, setPosPaid] = useState(0);
  const [posPaymentDate, setPosPaymentDate] = useState("");
  const [posInstrumentType, setPosInstrumentType] = useState("");
  const [posInstrumentNo, setPosInstrumentNo] = useState("");
  const [posPaymentProof, setPosPaymentProof] = useState("");
  const [posSurchargeLockedAmount, setPosSurchargeLockedAmount] = useState(0);
  const [posSurchargeLockedBase, setPosSurchargeLockedBase] = useState(0);
const [posSurchargeCyclesBase, setPosSurchargeCyclesBase] = useState(0);

  const [posSurchargeCyclesApplied, setPosSurchargeCyclesApplied] = useState(0);
  const [posSurchargeBlocks, setPosSurchargeBlocks] = useState([]);


  const didInitEdits = useRef(false);

  // ✅ Draggable Possession row key + order
  const POS_KEY = "__possession__";
  const [rowOrder, setRowOrder] = useState([]);

  function withKeys(list) {
  return (list || []).map((r) => {
    const lockedFromDb = Number(
      r.latePaymentSurcharge ?? r.LatePaymentSurcharge ?? 0
    );

    return {
      ...r,
      __key:
        r.__key ||
        (r.id ? `id-${r.id}` : `tmp-${crypto.randomUUID?.() || Date.now()}`),

      // ✅ ALWAYS keep locked surcharge from DB
      surchargeLockedAmount: Number(r.surchargeLockedAmount || lockedFromDb || 0),
      surchargeCyclesApplied: Number(r.surchargeCyclesApplied || 0),
      surchargeLockedAt: r.surchargeLockedAt || null,

      // ✅ base (saved) snapshot — Save se pehle yahi fixed rahega
surchargeLockedBase: Number(r.surchargeLockedAmount || lockedFromDb || 0),
surchargeCyclesBase: Number(r.surchargeCyclesApplied || 0),



// ✅ saved balance snapshot (used for next cycles after first)
surchargeBalanceBase: Number(
  r.surchargeBalanceBase ??
  Math.max(0, Number(r.installmentAmount || 0) - effectivePaid(r))
),

      // ✅ keep blocks safe
      surchargeBlocks: Array.isArray(r.surchargeBlocks) ? r.surchargeBlocks : [],

      
    };
  });
}

  async function load() {
    setLoading(true);
    setMsg("");
    try {
      const res = await client.get(`/api/admin/ledger/${contractId}`);
      const c = res.data.contract;
      const r = withKeys(res.data.rows || []);

      setContract(c);
      setRows(r);

      setTotalAmountEdit(Number(c?.totalAmount || 0));
      setDownPaymentEdit(Number(c?.downPayment || 0));
      setPossessionPctEdit(Number(c?.possession || 0));
      setMonthsEdit(Number(c?.months || 0));

      // ✅ init POSSESSION fields (if backend returns them; else safe defaults)
      setPosDueDate(c?.possessionDueDate ? String(c.possessionDueDate).slice(0, 10) : "");
      setPosPaid(Number(c?.possessionPaid || 0));
      setPosPaymentDate(c?.possessionPaymentDate ? String(c.possessionPaymentDate).slice(0, 10) : "");
      setPosInstrumentType(c?.possessionInstrumentType || "");
      setPosInstrumentNo(c?.possessionInstrumentNo || "");
      setPosPaymentProof(c?.possessionPaymentProof || "");
      setPosSurchargeLockedAmount(Number(c?.possessionSurchargeLockedAmount || 0));
      setPosSurchargeCyclesApplied(Number(c?.possessionSurchargeCyclesApplied || 0));
      setPosSurchargeLockedBase(Number(c?.possessionSurchargeLockedAmount || 0));
setPosSurchargeCyclesBase(Number(c?.possessionSurchargeCyclesApplied || 0));

      setPosSurchargeBlocks(
  Array.isArray(c?.possessionSurchargeBlocks) ? c.possessionSurchargeBlocks : []
);


      // ✅ init order (rows + possession if enabled)
      const baseKeys = (r || []).map((x) => x.__key);
      const keysWithPossession =
        Number(c?.possession || 0) > 0 ? [...baseKeys, POS_KEY] : baseKeys;
      setRowOrder(keysWithPossession);

      didInitEdits.current = true;
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
  }, [contractId]);

  // ---------- AUTO CALCULATIONS ----------
  const totalAmount = Number(totalAmountEdit || 0);
  const downPayment = Number(downPaymentEdit || 0);
  const months = Number(monthsEdit || 0);
  const possessionPct = Number(possessionPctEdit || 0);

  const possessionAmount = Math.round((totalAmount * possessionPct) / 100);
  const monthlyTotal = Math.max(0, totalAmount - downPayment - possessionAmount);

  // ✅ Keep rowOrder synced with rows + possession toggle
  useEffect(() => {
    setRowOrder((prev) => {
      const rowKeys = rows.map((r) => r.__key);

      // keep only keys that still exist (except POS_KEY)
      let next = prev.filter((k) => k === POS_KEY || rowKeys.includes(k));

      // add missing keys (new rows)
      for (const k of rowKeys) {
        if (!next.includes(k)) next.push(k);
      }

      // possession key add/remove
      if (possessionPctEdit > 0) {
        if (!next.includes(POS_KEY)) next.push(POS_KEY);
      } else {
        next = next.filter((k) => k !== POS_KEY);
      }

      return next;
    });
  }, [rows, possessionPctEdit]);

  // ✅✅ 30-DAY SURCHARGE ACCUMULATOR FOR INSTALLMENT ROWS
  // Every time late days cross another 30-day block, add NEW surcharge:
  // previousLocked + (5% of CURRENT balance) * (newCycles)
  // ✅✅ 30-DAY SURCHARGE ACCUMULATOR FOR INSTALLMENT ROWS
// Rule:
// - First surcharge ONLY after BOTH DueDate + PaymentDate exist.
// - Late days = DueDate -> LatestPaymentDate (parent/child)
// - Each 30-day boundary adds 5% of CURRENT balance (after payments)
// useEffect(() => {
//   setRows((prev) => {
//     let changed = false;

//     const next = prev.map((r) => {
//       const inst = Number(r.installmentAmount || 0);
//       if (inst <= 0) return r;

//       // ✅ Paid includes parent + children
//       const paid = effectivePaid(r);
//       const balance = Math.max(0, inst - paid);

//       // ✅ latest payment date among parent + child
//       const payDate = effectivePaymentDate(r);

//       // ✅ IMPORTANT: if no payment date => no surcharge at all
//       const daysLate = lateDaysWhenPaid(r.dueDate, payDate);
//       const shouldHaveCycles = cyclesFromLateDays(daysLate);

//       const applied = Number(r.surchargeCyclesApplied || 0);
//       if (shouldHaveCycles <= applied) return r;

//       const prevLocked = Number(r.surchargeLockedAmount || 0);
//       const cyclesToAdd = shouldHaveCycles - applied;

//       let add = 0;
//       for (let i = 0; i < cyclesToAdd; i++) {
//         add += balance > 0 ? Math.round((SURCHARGE_PCT / 100) * balance) : 0;
//       }

//       changed = true;
//       return {
//         ...r,
//         surchargeLockedAmount: prevLocked + add,
//         surchargeCyclesApplied: shouldHaveCycles,
//         surchargeLockedAt: new Date().toISOString().slice(0, 10),
//       };
//     });

//     return changed ? next : prev;
//   });
// }, [rows]);




  // ✅✅ 30-DAY SURCHARGE ACCUMULATOR FOR POSSESSION (separate state)
 // ✅✅ 30-DAY SURCHARGE ACCUMULATOR FOR POSSESSION (separate state)
// useEffect(() => {
//   if (possessionPctEdit <= 0) return;
//   if (!posDueDate) return;

//   const inst = Number(possessionAmount || 0);
//   const paid = Number(posPaid || 0);
//   const balance = Math.max(0, inst - paid);

//   // ✅ First surcharge only when BOTH due date + payment date exist
//   const daysLate = lateDaysWhenPaid(posDueDate, posPaymentDate);

//   const shouldHaveCycles = cyclesFromLateDays(daysLate);
//   const applied = Number(posSurchargeCyclesApplied || 0);

//   if (shouldHaveCycles <= applied) return;

//   const cyclesToAdd = shouldHaveCycles - applied;

//   setPosSurchargeBlocks((prev) => {
//     const blocks = Array.isArray(prev) ? [...prev] : [];

//     for (let i = 1; i <= cyclesToAdd; i++) {
//       const cycleNo = applied + i;
//       blocks.push(makeBlock({ cycle: cycleNo, balance }));
//     }

//     const newTotal = sumBlocks(blocks);
//     setPosSurchargeLockedAmount(newTotal);
//     return blocks;
//   });

//   setPosSurchargeCyclesApplied(shouldHaveCycles);
//   // eslint-disable-next-line
// }, [
//   possessionPctEdit,
//   possessionAmount,
//   posDueDate,
//   posPaid,
//   posPaymentDate,
//   posSurchargeCyclesApplied,
// ]);



  async function downloadLedgerFile(type) {
    if (!contractId) return;

    const isPdf = type === "pdf";
    const endpoint = isPdf
      ? `/api/admin/ledger/${contractId}/export/pdf`
      : `/api/admin/ledger/${contractId}/export/excel`;

    const filename = isPdf
      ? `ledger-contract-${contractId}.pdf`
      : `ledger-contract-${contractId}.xlsx`;

    try {
      setMsg("");
      if (isPdf) setDownloadingPdf(true);

      const res = await client.get(endpoint, { responseType: "blob" });

      const blob = new Blob([res.data], {
        type: isPdf
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setMsg(
        e.response?.data?.error ||
          e.message ||
          `Failed to download ${type.toUpperCase()}`
      );
    } finally {
      if (isPdf) setDownloadingPdf(false);
    }
  }

  function rebuildInstallments() {
    if (!contract) return;
    if (!months || months <= 0) {
      setMsg("Months missing in contract");
      
      return;
    }

    const prevMap = new Map();
    rows.forEach((r) => prevMap.set(Number(r.srNo), r));

    const base = Math.floor(monthlyTotal / months);
    const remainder = monthlyTotal - base * months;

    const start = contract.startDate ? new Date(contract.startDate) : new Date();

    const gen = Array.from({ length: months }).map((_, i) => {
      const srNo = i + 1;
      const inst = base + (i < remainder ? 1 : 0);

      const due = new Date(start);
      due.setMonth(due.getMonth() + i);

      const old = prevMap.get(srNo) || {};

      return {
        ...old,

        // ✅ keep surcharge accumulator fields
        // ✅ base snapshot must survive rebuild
surchargeLockedBase: Number(old.surchargeLockedBase ?? old.surchargeLockedAmount ?? 0),
surchargeCyclesBase: Number(old.surchargeCyclesBase ?? old.surchargeCyclesApplied ?? 0),


surchargeBalanceBase: Number(
  old.surchargeBalanceBase ??
  Math.max(0, Number(old.installmentAmount || inst) - effectivePaid(old))
),


        surchargeLockedAmount: Number(old.surchargeLockedAmount || 0),
        surchargeCyclesApplied: Number(old.surchargeCyclesApplied || 0),
        surchargeLockedAt: old.surchargeLockedAt || null,

        __key:
          old.__key ||
          (old.id
            ? `id-${old.id}`
            : `tmp-${crypto.randomUUID?.() || Date.now()}`),
        id: old.id || null,
        srNo,
        description: old.description || `${srNo}${ordinal(srNo)} INSTALLMENT`,
        installmentAmount: inst,
        dueDate: old.dueDate
          ? String(old.dueDate).slice(0, 10)
          : due.toISOString().slice(0, 10),
        amountPaid: old.amountPaid || 0, // parent paid (kept)
        paymentDate: old.paymentDate || "",
        paymentProof: old.paymentProof || "",
        instrumentType: old.instrumentType || "",
        instrumentNo: old.instrumentNo || "",
        children: (old.children || []).map((c) => ({
          ...c,
          __ckey:
            c.__ckey ||
            (c.id
              ? `cid-${c.id}`
              : `ctmp-${crypto.randomUUID?.() || Date.now()}`),
        })),
      };
    });

    setRows(gen);
  }

  useEffect(() => {
    if (!didInitEdits.current) return;
    if (!contract) return;
    rebuildInstallments();
    // eslint-disable-next-line
  }, [totalAmountEdit, downPaymentEdit, possessionPctEdit, monthsEdit]);

  // ---------- ROW EDIT HANDLERS ----------
  function updateRow(idx, patch) {
    setRows((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], ...patch };
      return copy;
    });
  }

  function addRow() {
    
    const nextSr = rows.length
      ? Math.max(...rows.map((r) => Number(r.srNo))) + 1
      : 1;

    setRows((prev) => [
      ...prev,
      {
        __key: `tmp-${crypto.randomUUID?.() || Date.now()}`,
        id: null,
        srNo: nextSr,
        description: "",
        installmentAmount: 0,
        dueDate: "",
        amountPaid: 0,
        paymentDate: "",
        paymentProof: "",
        instrumentType: "",
        instrumentNo: "",
        surchargeBalanceBase: 0,

        children: [],

        // ✅ surcharge accumulator fields
        surchargeLockedBase: 0,
surchargeCyclesBase: 0,

        surchargeLockedAmount: 0,
        surchargeCyclesApplied: 0,
        surchargeLockedAt: null,
        surchargeBlocks: [],

      },
    ]);
  }

  function deleteRow(idx) {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  // ---------- CHILD ROW HANDLERS ----------
  function toggleChildren(key) {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function addChildRow(parentIdx) {
    setRows((prev) => {
      const copy = [...prev];
      const parent = copy[parentIdx];
      const children = [...(parent.children || [])];

      const nextLine = children.length
        ? Math.max(...children.map((c) => Number(c.lineNo || 0))) + 1
        : 1;

      children.push({
        __ckey: `ctmp-${crypto.randomUUID?.() || Date.now()}`,
        id: null,
        lineNo: nextLine,
        description: "",
        amountPaid: 0,
        paymentDate: "",
        instrumentType: "",
        instrumentNo: "",
      });

      copy[parentIdx] = { ...parent, children };
      return copy;
    });

    // auto expand
    setExpandedKeys((prev) => new Set(prev).add(rows[parentIdx]?.__key));
  }

  function updateChildRow(parentIdx, childIdx, patch) {
    setRows((prev) => {
      const copy = [...prev];
      const parent = copy[parentIdx];
      const children = [...(parent.children || [])];
      children[childIdx] = { ...children[childIdx], ...patch };
      copy[parentIdx] = { ...parent, children };
      return copy;
    });
  }

  function deleteChildRow(parentIdx, childIdx) {
    setRows((prev) => {
      const copy = [...prev];
      const parent = copy[parentIdx];
      const children = (parent.children || []).filter((_, i) => i !== childIdx);
      copy[parentIdx] = { ...parent, children };
      return copy;
    });
  }

  // ✅✅ DRAG END HANDLER (includes possession)
  function onDragEnd(event) {
    const { active, over } = event;
    if (!over) return;
    if (active.id === over.id) return;

    setRowOrder((prev) => {
      const oldIndex = prev.indexOf(active.id);
      const newIndex = prev.indexOf(over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const moved = arrayMove(prev, oldIndex, newIndex);

      // ✅ re-number only REAL rows (not possession)
      const realKeysInOrder = moved.filter((k) => k !== POS_KEY);

      setRows((prevRows) => {
        const map = new Map(prevRows.map((r) => [r.__key, r]));
        return realKeysInOrder
          .map((k, i) => {
            const row = map.get(k);
            if (!row) return null;
            return { ...row, srNo: i + 1 };
          })
          .filter(Boolean);
      });

      return moved;
    });
  }

  async function uploadProofFile(idx, file) {
    if (!file) return;

    try {
      setMsg("");

      const fd = new FormData();
      fd.append("file", file);
      fd.append("srNo", String(rows[idx]?.srNo || ""));
      if (rows[idx]?.id) fd.append("rowId", String(rows[idx].id));

      const res = await client.post(
        `/api/admin/ledger/${contractId}/upload-proof`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      const url = res?.data?.url;
      if (!url) throw new Error("Upload failed (no url returned)");

      updateRow(idx, { paymentProof: url });
      setMsg("Payment proof uploaded ✅");
    } catch (e) {
      console.error(e);
      setMsg(e.response?.data?.error || e.message || "Failed to upload proof");
    }
  }

  // ✅ upload POSSESSION proof (reuses same endpoint; backend should accept srNo="POSSESSION")
  async function uploadPossessionProof(file) {
    if (!file) return;

    try {
      setMsg("");

      const fd = new FormData();
      fd.append("file", file);
      fd.append("srNo", "POSSESSION");

      const res = await client.post(
        `/api/admin/ledger/${contractId}/upload-proof`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      const url = res?.data?.url;
      if (!url) throw new Error("Upload failed (no url returned)");

      setPosPaymentProof(url);
      setMsg("Possession proof uploaded ✅");
    } catch (e) {
      console.error(e);
      setMsg(e.response?.data?.error || e.message || "Failed to upload proof");
    }
  }


  async function deleteProofForRow(idx) {
  try {
    setMsg("");

    const row = rows[idx];
    if (!row) return;

    // ✅ prefer rowId (best), fallback srNo
    const payload = row.id
      ? { rowId: Number(row.id) }
      : { srNo: Number(row.srNo) };

    await client.delete(`/api/admin/ledger/${contractId}/delete-proof`, {
      data: payload,
    });

    updateRow(idx, { paymentProof: "" });
    setMsg("Payment proof deleted ✅");
  } catch (e) {
    console.error(e);
    setMsg(e.response?.data?.error || e.message || "Failed to delete proof");
  }
}



async function deletePossessionProof() {
  try {
    setMsg("");

    // ⚠️ This will only work if your backend supports POSSESSION proof.
    // Right now your backend delete-proof expects ledgerrow rowId/srNo (number).
    await client.delete(`/api/admin/ledger/${contractId}/delete-proof`, {
      data: { srNo: "POSSESSION" },
    });

    setPosPaymentProof("");
    setMsg("Possession proof deleted ✅");
  } catch (e) {
    console.error(e);
    setMsg(e.response?.data?.error || e.message || "Failed to delete proof");
  }
}



  

  async function saveAll() {
  setSaving(true);
  setMsg("");
  try {
    // validate srNo unique
    const set = new Set();
    for (const r of rows) {
      const sr = Number(r.srNo);
      if (!sr) throw new Error("Each row needs Sr No");
      if (set.has(sr)) throw new Error("Sr No must be unique");
      set.add(sr);

      // validate child lineNo unique per parent
      const childSet = new Set();
      for (const c of r.children || []) {
        const ln = Number(c.lineNo);
        if (!ln) throw new Error(`Child row lineNo missing in SrNo ${sr}`);
        if (childSet.has(ln))
          throw new Error(`Child lineNo must be unique in SrNo ${sr}`);
        childSet.add(ln);
      }
    }

    // ✅ IMPORTANT: Do NOT send any surcharge fields from frontend
    const payloadRows = rows.map((r) => {
      return {
        id: r.id || null,
        srNo: Number(r.srNo),
        description: r.description || "",
        installmentAmount: Number(r.installmentAmount || 0),
        dueDate: r.dueDate ? String(r.dueDate).slice(0, 10) : new Date().toISOString().slice(0, 10),

        amountPaid: Number(r.amountPaid || 0),
        paymentDate: r.paymentDate ? String(r.paymentDate).slice(0, 10) : null,

        paymentProof: r.paymentProof ? r.paymentProof : null,
        instrumentType: r.instrumentType ? r.instrumentType : null,
        instrumentNo: r.instrumentNo ? r.instrumentNo : null,

        children: (r.children || []).map((c) => ({
          id: c.id || null,
          lineNo: Number(c.lineNo),
          description: c.description || "",
          amountPaid: Number(c.amountPaid || 0),
          paymentDate: c.paymentDate ? String(c.paymentDate).slice(0, 10) : null,
          paymentProof: c.paymentProof ? c.paymentProof : null,
          instrumentType: c.instrumentType ? c.instrumentType : null,
          instrumentNo: c.instrumentNo ? c.instrumentNo : null,
        })),
      };
    });

    const payloadContract = {
      totalAmount: Number(totalAmountEdit || 0),
      downPayment: Number(downPaymentEdit || 0),
      possession: Number(possessionPctEdit || 0),
      months: Number(monthsEdit || 0),

      // ✅ possession info (no surcharge fields here too)
      possessionDueDate: posDueDate ? posDueDate : null,
      possessionPaid: Number(posPaid || 0),
      possessionPaymentDate: posPaymentDate ? posPaymentDate : null,
      possessionInstrumentType: posInstrumentType ? posInstrumentType : null,
      possessionInstrumentNo: posInstrumentNo ? posInstrumentNo : null,
      possessionPaymentProof: posPaymentProof ? posPaymentProof : null,
    };

    const res = await client.put(`/api/admin/ledger/${contractId}`, {
      rows: payloadRows,
      contract: payloadContract,
    });

    // refresh contract + rows from backend (backend is source of truth)
    if (res?.data?.contract) {
      const c = res.data.contract;
      setContract(c);

      setTotalAmountEdit(Number(c?.totalAmount || payloadContract.totalAmount));
      setDownPaymentEdit(Number(c?.downPayment || payloadContract.downPayment));
      setPossessionPctEdit(Number(c?.possession || payloadContract.possession));
      setMonthsEdit(Number(c?.months || payloadContract.months));

      setPosDueDate(
        c?.possessionDueDate
          ? String(c.possessionDueDate).slice(0, 10)
          : (payloadContract.possessionDueDate || "")
      );
      setPosPaid(Number(c?.possessionPaid ?? payloadContract.possessionPaid ?? 0));
      setPosPaymentDate(
        c?.possessionPaymentDate
          ? String(c.possessionPaymentDate).slice(0, 10)
          : (payloadContract.possessionPaymentDate || "")
      );
      setPosInstrumentType(c?.possessionInstrumentType ?? payloadContract.possessionInstrumentType ?? "");
      setPosInstrumentNo(c?.possessionInstrumentNo ?? payloadContract.possessionInstrumentNo ?? "");
      setPosPaymentProof(c?.possessionPaymentProof ?? payloadContract.possessionPaymentProof ?? "");

      // these bases come from backend (if you keep those fields in DB)
      setPosSurchargeLockedAmount(Number(c?.possessionSurchargeLockedAmount || 0));
      setPosSurchargeCyclesApplied(Number(c?.possessionSurchargeCyclesApplied || 0));
      setPosSurchargeLockedBase(Number(c?.possessionSurchargeLockedAmount || 0));
      setPosSurchargeCyclesBase(Number(c?.possessionSurchargeCyclesApplied || 0));
    } else {
      setContract((prev) => ({ ...(prev || {}), ...payloadContract }));
    }

    // ✅ Always set rows from backend
    setRows(withKeys(res.data.rows || payloadRows));
    setMsg("Saved successfully ✅");
  } catch (e) {
    console.error(e);
    setMsg(e.response?.data?.error || e.message || "Failed to save");
  } finally {
    setSaving(false);
  }
}


    // ---------- TOTALS ----------
  const totalPayable = Math.round(possessionAmount + monthlyTotal);

  // ✅ Paid includes child + possession paid
  const totalPaidRows = rows.reduce((sum, r) => sum + effectivePaid(r), 0);
  const totalPaid = totalPaidRows + Number(posPaid || 0);

  // ✅ Receivable = PURE BALANCE ONLY (NO SURCHARGE)
  const totalReceivable = Math.max(0, totalPayable - totalPaid);

  const totalSurchargeRows = rows.reduce((sum, r) => {
  const calc = computeRowSurchargeDisplay(r);
  return sum + Number(calc.surcharge || 0);
}, 0);

  const posCalcForTotals = computePossessionSurchargeDisplay({
  possessionAmount,
  posPaid,
  posDueDate,
  posPaymentDate,
  posSurchargeLockedAmountBase: posSurchargeLockedBase,
  posSurchargeCyclesBase: posSurchargeCyclesBase,
});

const totalSurcharge = totalSurchargeRows + Number(posCalcForTotals.surcharge || 0);


  // ✅ IMPORTANT: Total Due should NOT include surcharge
  // (Keep this variable only if you use it somewhere else)
  const totalReceivableWithSurcharge = totalReceivable;



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

  const msgTone = msg?.includes("✅") ? "green" : "orange";

  // ---------- POSSESSION computed values ----------
  const posInst = Number(possessionAmount || 0);
  const posPaidNum = Number(posPaid || 0);
  const posBalance = posPaidNum > 0 ? Math.max(0, posInst - posPaidNum) : 0;

  const posLateDays = lateDaysWhenPaid(posDueDate, posPaymentDate);

  const posProofHref = fileUrl(posPaymentProof);
  const posProofSrc = fileUrl(posPaymentProof);
  const posSurchargeTotal = sumBlocks(posSurchargeBlocks);


  return (
    <SidebarLayout
      title="Client Ledger"
      subtitle={
        contract
          ? `${contract.clientName || ""} • ${contract.unitNumber || ""}`
          : ""
      }
      navItems={navItems}
      activeKey="clients"
      onNav={handleNav}
      user={user}
      onLogout={onLogout}
      children={{
        topRight: (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <GhostButton
              onClick={() => downloadLedgerFile("pdf")}
              disabled={downloadingPdf || loading}
            >
              {downloadingPdf ? "Downloading PDF..." : "⬇ PDF"}
            </GhostButton>

            <GhostButton onClick={addRow}>＋ Add Row</GhostButton>

            <PrimaryButton onClick={saveAll} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </PrimaryButton>
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
            {/* Poppins font import (page-only) */}
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
                {/* TOP SUMMARY STRIP */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 12,
                  }}
                >
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Pill tone="blue">Payable: {fmt(totalPayable)}</Pill>
                    <Pill tone="green">Paid: {fmt(totalPaid)}</Pill>
                    <Pill tone="orange">Receivable: {fmt(totalReceivable)}</Pill>
                    <Pill tone={totalSurcharge > 0 ? "red" : "purple"}>
                      Surcharge: {fmt(totalSurcharge)}
                    </Pill>
                    <Pill tone="purple">
  Total Due: {fmt(totalReceivable)}
</Pill>

                  </div>
                  <div
                    style={{ color: "#64748b", fontWeight: 700, fontSize: 12 }}
                  >
                    Drag rows using ☰ handle
                  </div>
                </div>

                {/* HEADER INPUTS */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                    gap: 12,
                    marginBottom: 14,
                  }}
                >
                  <div style={panel()}>
                    <div style={label()}>TOTAL AMOUNT</div>
                    <Input
                      type="number"
                      value={totalAmountEdit}
                      onChange={(e) => setTotalAmountEdit(e.target.value)}
                    />
                  </div>

                  <div style={panel()}>
                    <div style={label()}>DOWNPAYMENT</div>
                    <Input
                      type="number"
                      value={downPaymentEdit}
                      onChange={(e) => setDownPaymentEdit(e.target.value)}
                    />
                  </div>

                  <div style={panel()}>
                    <div style={label()}>POSSESSION %</div>
                    <Input
                      type="number"
                      value={possessionPctEdit}
                      onChange={(e) => setPossessionPctEdit(e.target.value)}
                    />
                  </div>

                  <div style={panel()}>
                    <div style={label()}>MONTHS</div>
                    <Input
                      type="number"
                      value={monthsEdit}
                      onChange={(e) => setMonthsEdit(e.target.value)}
                    />
                  </div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "separate",
                      borderSpacing: 0,
                      minWidth: 1780,
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
                          "",
                          "Sr No",
                          "Description",
                          "Installment Amount",
                          "Due Date",
                          "Installment Paid",
                          "Payment Date",
                          "Instrument Type",
                          "Instrument No",
                          "Balance",
                          "Late Payment Surcharge",
                          "Late Payment Days",
                          "Payment Proof",
                          "Actions",
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
                      {/* TOTAL AMOUNT */}
                      <tr style={zebra(0)}>
                        <td style={td()}></td>
                        <td style={td()}></td>
                        <td style={td({ fontWeight: 900 })}>
                          <Pill tone="blue">TOTAL AMOUNT</Pill>
                        </td>
                        <td style={td({ fontWeight: 900 })}>
                          {fmt(totalAmount)}
                        </td>
                        {Array.from({ length: 9 }).map((_, i) => (
                          <td key={i} style={td()}></td>
                        ))}
                        <td style={td()}></td>
                        <td style={td()}></td>
                      </tr>

                      {/* DOWNPAYMENT */}
                      <tr style={zebra(1)}>
                        <td style={td()}></td>
                        <td style={td()}></td>
                        <td style={td({ fontWeight: 900 })}>
                          <Pill tone="green">DOWNPAYMENT</Pill>
                        </td>
                        <td style={td({ fontWeight: 900 })}>
                          {fmt(downPayment)}
                        </td>
                        <td style={td()}>
                          {contract.bookingDate
                            ? String(contract.bookingDate).slice(0, 10)
                            : ""}
                        </td>
                        <td style={td()}>{fmt(downPayment)}</td>
                        <td style={td()}>
                          {contract.bookingDate
                            ? String(contract.bookingDate).slice(0, 10)
                            : ""}
                        </td>
                        {Array.from({ length: 6 }).map((_, i) => (
                          <td key={i} style={td()}></td>
                        ))}
                        <td style={td()}></td>
                      </tr>

                      {/* MONTHLY TOTAL */}
                      <tr style={zebra(0)}>
                        <td style={td()}></td>
                        <td style={td()}></td>
                        <td style={td({ fontWeight: 900 })}>
                          <Pill tone="purple">
                            {months} MONTHLY INSTALLMENTS
                          </Pill>
                        </td>
                        <td style={td({ fontWeight: 900 })}>
                          {fmt(monthlyTotal)}
                        </td>
                        {Array.from({ length: 9 }).map((_, i) => (
                          <td key={i} style={td()}></td>
                        ))}
                        <td style={td()}></td>
                        <td style={td()}></td>
                      </tr>

                      {/* ✅ DRAG & DROP ROWS (INCLUDING POSSESSION) */}
                      <DndContext
                        collisionDetection={closestCenter}
                        onDragEnd={onDragEnd}
                      >
                        <SortableContext
                          items={rowOrder}
                          strategy={verticalListSortingStrategy}
                        >
                          {rowOrder.map((key) => {
                            // ✅ POSSESSION draggable row (NOW editable + surcharge)
                            if (key === POS_KEY) {
                              const posCalc = computePossessionSurchargeDisplay({
  possessionAmount,
  posPaid,
  posDueDate,
  posPaymentDate,
  posSurchargeLockedAmountBase: posSurchargeLockedBase,
  posSurchargeCyclesBase: posSurchargeCyclesBase,
});

const surcharge = Number(posCalc.surcharge || 0);

const rowTone =
  surcharge > 0 ? "#fef2f2" : posCalc.daysLate > 0 ? "#fff7ed" : "transparent";




                              return (
                                <SortableRow
                                  key={POS_KEY}
                                  row={{ __key: POS_KEY }}
                                >
                                  <td style={td({ background: rowTone })}>
                                    <span
                                      style={{
                                        color: "#94a3b8",
                                        fontWeight: 900,
                                      }}
                                    >
                                      —
                                    </span>
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <Pill tone="purple">
                                      POSSESSION {possessionPct}%
                                    </Pill>
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <span style={{ fontWeight: 900 }}>
                                      {fmt(possessionAmount)}
                                    </span>
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <Input
                                      type="date"
                                      value={posDueDate || ""}
                                      onChange={(e) =>
                                        setPosDueDate(e.target.value)
                                      }
                                    />
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <Input
                                      type="number"
                                      value={posPaid || 0}
                                      onChange={(e) =>
                                        setPosPaid(e.target.value)
                                      }
                                    />
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <Input
                                      type="date"
                                      value={posPaymentDate || ""}
                                      onChange={(e) =>
                                        setPosPaymentDate(e.target.value)
                                      }
                                    />
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <Select
                                      value={posInstrumentType || ""}
                                      onChange={(e) =>
                                        setPosInstrumentType(e.target.value)
                                      }
                                    >
                                      <option value="">Select</option>
                                      <option value="CASH">CASH</option>
                                      <option value="CHEQUE">CHEQUE</option>
                                      <option value="BANK">BANK</option>
                                      <option value="ONLINE">ONLINE</option>
                                    </Select>
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <Input
                                      value={posInstrumentNo || ""}
                                      placeholder="Cheque/Txn/Ref"
                                      onChange={(e) =>
                                        setPosInstrumentNo(e.target.value)
                                      }
                                    />
                                  </td>

                                  <td
                                    style={td({
                                      fontWeight: 900,
                                      background: rowTone,
                                    })}
                                  >
                                    <Pill
                                      tone={posBalance > 0 ? "orange" : "green"}
                                    >
                                      {fmt(posBalance)}
                                    </Pill>
                                  </td>

                                  <td
  style={td({
    fontWeight: 900,
    background: rowTone,
  })}
>
  {surcharge > 0 ? (
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Pill tone={posCalc.previewAdd > 0 ? "orange" : "red"}>
        {fmt(surcharge)}
      </Pill>

      {posCalc.previewAdd > 0 && <Pill tone="blue">Not Saved</Pill>}
    </div>
  ) : (
    <span style={{ color: "#94a3b8", fontWeight: 800 }}>—</span>
  )}
</td>


                                  <td style={td({ background: rowTone })}>
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        alignItems: "center",
                                      }}
                                    >
                                      <label
                                        style={{
                                          cursor: "pointer",
                                          padding: "10px 12px",
                                          borderRadius: 12,
                                          border: "1px solid #e5e7eb",
                                          background: "#ffffff",
                                          fontWeight: 900,
                                          fontSize: 12,
                                        }}
                                      >
                                        Upload
                                        <input
                                          type="file"
                                          accept="image/*,application/pdf"
                                          style={{ display: "none" }}
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file)
                                              uploadPossessionProof(file);
                                            e.target.value = "";
                                          }}
                                        />
                                      </label>

                                      {posPaymentProof ? (
  <>
    <a
      href={posProofHref}
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
      }}
    >
      View
    </a>

    <DangerButton
      onClick={deletePossessionProof}
      style={{ padding: "10px 12px", fontSize: 12 }}
    >
      Delete
    </DangerButton>
  </>
) : (
  <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
    No file
  </span>
)}

                                    </div>

                                    {posPaymentProof && (
                                      <div style={{ marginTop: 8 }}>
                                        <img
                                          src={posProofSrc}
                                          alt="Possession Proof"
                                          style={{
                                            width: 130,
                                            height: 78,
                                            objectFit: "cover",
                                            borderRadius: 14,
                                            border: "1px solid #e5e7eb",
                                          }}
                                          onError={(e) => {
                                            e.currentTarget.style.display =
                                              "none";
                                          }}
                                        />
                                      </div>
                                    )}
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <span
                                      style={{
                                        color: "#64748b",
                                        fontWeight: 800,
                                        fontSize: 12,
                                      }}
                                    >
                                      Included in totals
                                    </span>
                                  </td>
                                </SortableRow>
                              );
                            }

                            // ✅ Normal row by key
                            const idx = rows.findIndex((r) => r.__key === key);
                            if (idx === -1) return null;

                            const r = rows[idx];

                            const inst = Number(r.installmentAmount || 0);

                            // ✅ Paid includes parent + children
                            const paid = effectivePaid(r);

                            // ✅ Balance should reflect both
                            const balance = displayBalanceForRow(r);


                            // ✅ Late days uses latest payment date (parent or child)
                            const payDate = effectivePaymentDate(r);
                            const calc = computeRowSurchargeDisplay(r);
const lDays = calc.daysLate;
const surcharge = calc.surcharge;


                            const proofHref = fileUrl(r.paymentProof);
                            const proofSrc = fileUrl(r.paymentProof);

                            const rowTone =
  surcharge > 0 ? "#fef2f2" : lDays > 0 ? "#fff7ed" : "transparent";




                            const isExpanded = expandedKeys.has(r.__key);

                            return (
                              <>
                                <SortableRow key={r.__key} row={r}>
                                  <td style={td({ background: rowTone })}>
                                    <Input
                                      value={r.srNo}
                                      onChange={(e) =>
                                        updateRow(idx, { srNo: e.target.value })
                                      }
                                    />
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <Input
                                      value={r.description || ""}
                                      onChange={(e) =>
                                        updateRow(idx, {
                                          description: e.target.value,
                                        })
                                      }
                                    />
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <Input
                                      type="number"
                                      value={r.installmentAmount || 0}
                                      onChange={(e) =>
                                        updateRow(idx, {
                                          installmentAmount: e.target.value,
                                        })
                                      }
                                    />
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <Input
                                      type="date"
                                      value={
                                        r.dueDate
                                          ? String(r.dueDate).slice(0, 10)
                                          : ""
                                      }
                                      onChange={(e) =>
                                        updateRow(idx, {
                                          dueDate: e.target.value,
                                        })
                                      }
                                    />
                                  </td>

                                  {/* Parent paid (kept) */}
                                  <td style={td({ background: rowTone })}>
                                    <Input
                                      type="number"
                                      value={r.amountPaid || 0}
                                      onChange={(e) =>
                                        updateRow(idx, {
                                          amountPaid: e.target.value,
                                        })
                                      }
                                    />
                                    {/* ✅ show child sum + total paid */}
                                    {(r.children || []).length > 0 && (
                                      <div
                                        style={{
                                          marginTop: 6,
                                          fontSize: 12,
                                          color: "#64748b",
                                          fontWeight: 800,
                                        }}
                                      >
                                        Child Paid: {fmt(childPaidSum(r))} •
                                        Total Paid:{" "}
                                        <span style={{ color: "#0f172a" }}>
                                          {fmt(paid)}
                                        </span>
                                      </div>
                                    )}
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <Input
                                      type="date"
                                      value={
                                        r.paymentDate
                                          ? String(r.paymentDate).slice(0, 10)
                                          : ""
                                      }
                                      onChange={(e) =>
                                        updateRow(idx, {
                                          paymentDate: e.target.value,
                                        })
                                      }
                                    />
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <Select
                                      value={r.instrumentType || ""}
                                      onChange={(e) =>
                                        updateRow(idx, {
                                          instrumentType: e.target.value,
                                        })
                                      }
                                    >
                                      <option value="">Select</option>
                                      <option value="CASH">CASH</option>
                                      <option value="CHEQUE">CHEQUE</option>
                                      <option value="BANK">BANK</option>
                                      <option value="ONLINE">ONLINE</option>
                                    </Select>
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <Input
                                      value={r.instrumentNo || ""}
                                      placeholder="Cheque/Txn/Ref"
                                      onChange={(e) =>
                                        updateRow(idx, {
                                          instrumentNo: e.target.value,
                                        })
                                      }
                                    />
                                  </td>

                                  <td
                                    style={td({
                                      fontWeight: 900,
                                      background: rowTone,
                                    })}
                                  >
                                    <Pill
                                      tone={balance > 0 ? "orange" : "green"}
                                    >
                                      {fmt(balance)}
                                    </Pill>
                                  </td>

                                  <td
                                    style={td({
                                      fontWeight: 900,
                                      background: rowTone,
                                    })}
                                  >
                                    {surcharge > 0 ? (
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <Pill tone={calc.previewAdd > 0 ? "orange" : "red"}>
      {fmt(surcharge)}
    </Pill>

    {calc.previewAdd > 0 && <Pill tone="blue">Not Saved</Pill>}
  </div>
) : (
  <span style={{ color: "#94a3b8", fontWeight: 800 }}>—</span>
)}

                                  </td>

                                  <td
                                    style={td({
                                      fontWeight: 900,
                                      background: rowTone,
                                    })}
                                  >
                                    {lDays > 0 ? (
                                      <Pill
                                        tone={
                                          lDays >= SURCHARGE_AFTER_DAYS
                                            ? "red"
                                            : "orange"
                                        }
                                      >
                                        {lDays} day(s)
                                      </Pill>
                                    ) : (
                                      <span
                                        style={{
                                          color: "#94a3b8",
                                          fontWeight: 800,
                                        }}
                                      >
                                        —
                                      </span>
                                    )}
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        alignItems: "center",
                                      }}
                                    >
                                      <label
                                        style={{
                                          cursor: "pointer",
                                          padding: "10px 12px",
                                          borderRadius: 12,
                                          border: "1px solid #e5e7eb",
                                          background: "#ffffff",
                                          fontWeight: 900,
                                          fontSize: 12,
                                        }}
                                      >
                                        Upload
                                        <input
                                          type="file"
                                          accept="image/*,application/pdf"
                                          style={{ display: "none" }}
                                          onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file)
                                              uploadProofFile(idx, file);
                                            e.target.value = "";
                                          }}
                                        />
                                      </label>

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
      }}
    >
      View
    </a>

    <DangerButton
      onClick={() => deleteProofForRow(idx)}
      style={{ padding: "10px 12px", fontSize: 12 }}
    >
      Delete
    </DangerButton>
  </>
) : (
  <span style={{ fontSize: 12, color: "#64748b", fontWeight: 700 }}>
    No file
  </span>
)}

                                    </div>

                                    {r.paymentProof && (
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
                                            e.currentTarget.style.display =
                                              "none";
                                          }}
                                        />
                                      </div>
                                    )}
                                  </td>

                                  <td style={td({ background: rowTone })}>
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: 8,
                                        flexDirection: "column",
                                      }}
                                    >
                                      <GhostButton
                                        onClick={() => toggleChildren(r.__key)}
                                        style={{
                                          padding: "10px 12px",
                                          fontSize: 12,
                                        }}
                                      >
                                        {isExpanded ? "Hide" : "Show"}
                                      </GhostButton>

                                      <GhostButton
                                        onClick={() => addChildRow(idx)}
                                        style={{
                                          padding: "10px 12px",
                                          fontSize: 12,
                                        }}
                                      >
                                        + Child
                                      </GhostButton>

                                      <DangerButton
                                        onClick={() => deleteRow(idx)}
                                        style={{
                                          padding: "10px 12px",
                                          fontSize: 12,
                                        }}
                                      >
                                        Delete
                                      </DangerButton>
                                    </div>
                                  </td>
                                </SortableRow>

                                {/* ✅ CHILD ROWS PANEL */}
                                {isExpanded && (
                                  <tr>
                                    {/* total columns = 14, span all */}
                                    <td
                                      colSpan={14}
                                      style={{
                                        padding: 14,
                                        background: "#fbfdff",
                                        borderBottom: "1px solid #eef2f7",
                                      }}
                                    >
                                      <div
                                        style={{
                                          border: "1px solid #e5e7eb",
                                          borderRadius: 16,
                                          background: "white",
                                          boxShadow:
                                            "0 10px 24px rgba(2,6,23,0.05)",
                                          padding: 14,
                                        }}
                                      >
                                        <div
                                          style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            gap: 12,
                                            flexWrap: "wrap",
                                          }}
                                        >
                                          <GhostButton
                                            onClick={() => addChildRow(idx)}
                                            style={{ fontSize: 12 }}
                                          >
                                            + Add Child Row
                                          </GhostButton>
                                        </div>

                                        <div
                                          style={{
                                            marginTop: 12,
                                            overflowX: "auto",
                                          }}
                                        >
                                          <table
                                            style={{
                                              width: "100%",
                                              borderCollapse: "separate",
                                              borderSpacing: 0,
                                              minWidth: 980,
                                              background: "white",
                                              border: "1px solid #e5e7eb",
                                              borderRadius: 14,
                                              overflow: "hidden",
                                            }}
                                          >
                                            <thead>
                                              <tr
                                                style={{
                                                  background:
                                                    "linear-gradient(135deg, #0f172a, #111827)",
                                                  color: "white",
                                                }}
                                              >
                                                {[
                                                  "Line No",
                                                  "Description",
                                                  "Amount Paid",
                                                  "Payment Date",
                                                  "Instrument Type",
                                                  "Instrument No",
                                                  "Actions",
                                                ].map((h, i) => (
                                                  <th
                                                    key={i}
                                                    style={{
                                                      textAlign: "left",
                                                      padding: "12px 12px",
                                                      fontSize: 12,
                                                      fontWeight: 900,
                                                      whiteSpace: "nowrap",
                                                      borderBottom:
                                                        "1px solid rgba(255,255,255,0.18)",
                                                    }}
                                                  >
                                                    {h}
                                                  </th>
                                                ))}
                                              </tr>
                                            </thead>

                                            <tbody>
                                              {(r.children || []).length ===
                                              0 ? (
                                                <tr>
                                                  <td
                                                    colSpan={7}
                                                    style={{
                                                      padding: 14,
                                                      color: "#64748b",
                                                      fontWeight: 800,
                                                    }}
                                                  >
                                                    No child rows yet. Click “+
                                                    Add Child Row”.
                                                  </td>
                                                </tr>
                                              ) : (
                                                (r.children || []).map(
                                                  (c, cidx) => (
                                                    <tr
                                                      key={c.__ckey}
                                                      style={{
                                                        background:
                                                          cidx % 2 === 0
                                                            ? "#ffffff"
                                                            : "#fbfdff",
                                                      }}
                                                    >
                                                      <td style={td()}>
                                                        <Input
                                                          value={c.lineNo}
                                                          onChange={(e) =>
                                                            updateChildRow(
                                                              idx,
                                                              cidx,
                                                              {
                                                                lineNo:
                                                                  e.target
                                                                    .value,
                                                              }
                                                            )
                                                          }
                                                        />
                                                      </td>

                                                      <td style={td()}>
                                                        <Input
                                                          value={
                                                            c.description || ""
                                                          }
                                                          onChange={(e) =>
                                                            updateChildRow(
                                                              idx,
                                                              cidx,
                                                              {
                                                                description:
                                                                  e.target
                                                                    .value,
                                                              }
                                                            )
                                                          }
                                                        />
                                                      </td>

                                                      <td style={td()}>
                                                        <Input
                                                          type="number"
                                                          value={
                                                            c.amountPaid || 0
                                                          }
                                                          onChange={(e) =>
                                                            updateChildRow(
                                                              idx,
                                                              cidx,
                                                              {
                                                                amountPaid:
                                                                  e.target
                                                                    .value,
                                                              }
                                                            )
                                                          }
                                                        />
                                                      </td>

                                                      <td style={td()}>
                                                        <Input
                                                          type="date"
                                                          value={
                                                            c.paymentDate
                                                              ? String(
                                                                  c.paymentDate
                                                                ).slice(0, 10)
                                                              : ""
                                                          }
                                                          onChange={(e) =>
                                                            updateChildRow(
                                                              idx,
                                                              cidx,
                                                              {
                                                                paymentDate:
                                                                  e.target
                                                                    .value,
                                                              }
                                                            )
                                                          }
                                                        />
                                                      </td>

                                                      <td style={td()}>
                                                        <Select
                                                          value={
                                                            c.instrumentType ||
                                                            ""
                                                          }
                                                          onChange={(e) =>
                                                            updateChildRow(
                                                              idx,
                                                              cidx,
                                                              {
                                                                instrumentType:
                                                                  e.target
                                                                    .value,
                                                              }
                                                            )
                                                          }
                                                        >
                                                          <option value="">
                                                            Select
                                                          </option>
                                                          <option value="CASH">
                                                            CASH
                                                          </option>
                                                          <option value="CHEQUE">
                                                            CHEQUE
                                                          </option>
                                                          <option value="BANK">
                                                            BANK
                                                          </option>
                                                          <option value="ONLINE">
                                                            ONLINE
                                                          </option>
                                                        </Select>
                                                      </td>

                                                      <td style={td()}>
                                                        <Input
                                                          value={
                                                            c.instrumentNo || ""
                                                          }
                                                          placeholder="Cheque/Txn/Ref"
                                                          onChange={(e) =>
                                                            updateChildRow(
                                                              idx,
                                                              cidx,
                                                              {
                                                                instrumentNo:
                                                                  e.target
                                                                    .value,
                                                              }
                                                            )
                                                          }
                                                        />
                                                      </td>

                                                      <td style={td()}>
                                                        <DangerButton
                                                          onClick={() =>
                                                            deleteChildRow(
                                                              idx,
                                                              cidx
                                                            )
                                                          }
                                                          style={{
                                                            fontSize: 12,
                                                          }}
                                                        >
                                                          Delete
                                                        </DangerButton>
                                                      </td>
                                                    </tr>
                                                  )
                                                )
                                              )}
                                            </tbody>
                                          </table>
                                        </div>

                                        <div
                                          style={{
                                            marginTop: 10,
                                            display: "flex",
                                            gap: 10,
                                            flexWrap: "wrap",
                                          }}
                                        >
                                          <Pill tone="blue">
                                            Child Paid: {fmt(childPaidSum(r))}
                                          </Pill>
                                          <Pill tone="green">
                                            Total Paid (Parent+Child):{" "}
                                            {fmt(effectivePaid(r))}
                                          </Pill>
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                )}
                              </>
                            );
                          })}
                        </SortableContext>
                      </DndContext>

                      {/* TOTAL */}
                      <tr
                        style={{
                          background:
                            "linear-gradient(135deg, #0ea5e9, #22c55e)",
                          color: "white",
                        }}
                      >
                        <td
                          style={td({ fontWeight: 900, color: "white" })}
                        ></td>
                        <td
                          style={td({ fontWeight: 900, color: "white" })}
                        ></td>
                        <td style={td({ fontWeight: 900, color: "white" })}>
                          TOTAL
                        </td>
                        <td style={td({ fontWeight: 900, color: "white" })}>
                          {fmt(totalPayable)}
                        </td>
                        <td style={td({ color: "white" })}></td>
                        <td style={td({ fontWeight: 900, color: "white" })}>
                          {fmt(totalPaid)}
                        </td>
                        <td style={td({ color: "white" })}></td>
                        <td style={td({ color: "white" })}></td>
                        <td style={td({ color: "white" })}></td>
                        <td style={td({ fontWeight: 900, color: "white" })}>
  {fmt(totalReceivable)}
</td>

<td style={td({ fontWeight: 900, color: "white" })}>
  {fmt(totalSurcharge)}
</td>

<td style={td({ fontWeight: 900, color: "white" })}>
  —
</td>


                        <td style={td({ color: "white" })}></td>
                        <td style={td({ color: "white" })}></td>
                      </tr>
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
    boxShadow: "0 10px 22px rgba(2,6,23,0.05)",
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

function zebra(i) {
  return {
    background: i % 2 === 0 ? "#ffffff" : "#fbfdff",
  };
}
