// src/routes/adminLedger.js
const router = require("express").Router();
const prisma = require("../prisma");
const { auth, requireRole } = require("../middleware/auth");

const puppeteer = require("puppeteer");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ===================== AUTH =====================
router.use(auth, requireRole("ACQUISITION"));

// ===================== UPLOAD DIR =====================
// IMPORTANT: use process.cwd() so it works everywhere (local + server)
const UPLOAD_DIR = path.join(process.cwd(), "src", "uploads", "payment-proofs");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: function (_, __, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const contractId = String(req.params.contractId || "0");
    const originalExt = path.extname(file.originalname || "").toLowerCase();
    let ext = originalExt || "";

    // fallback ext by mimetype if missing
    if (!ext) {
      if (file.mimetype === "application/pdf") ext = ".pdf";
      else if (file.mimetype === "image/jpeg") ext = ".jpg";
      else if (file.mimetype === "image/png") ext = ".png";
      else if (file.mimetype === "image/webp") ext = ".webp";
      else ext = ".png";
    }

    const allowed = [".png", ".jpg", ".jpeg", ".webp", ".pdf"];
    if (!allowed.includes(ext)) ext = ".png";

    const stamp = Date.now();
    cb(null, `contract-${contractId}-${stamp}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB
  fileFilter: (_, file, cb) => {
    const ok = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "application/pdf",
    ].includes(file.mimetype);
    if (!ok) return cb(new Error("Only PNG/JPG/WEBP/PDF allowed"), false);
    cb(null, true);
  },
});

// ✅ Multer error wrapper (important)
function uploadSingle(fieldName) {
  return (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          error: err.message || "Upload failed",
        });
      }
      next();
    });
  };
}

// ===================== SETTINGS (MATCH FRONTEND) =====================
const SURCHARGE_PCT = 5;
const SURCHARGE_AFTER_DAYS = 30;

// ===================== HELPERS =====================
function fmt(n) {
  const num = Number(n || 0);
  return `Rs. ${num.toLocaleString("en-PK")}`;
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// parse YYYY-MM-DD safely (no timezone shift)
function toDateOnlyAny(d) {
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

// ✅ TODAY in Pakistan timezone
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

function lateDays(dueDate) {
  const due = toDateOnlyAny(dueDate);
  if (!due) return 0;

  const today = todayPKDateOnly();
  const diffMs = today.getTime() - due.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

function calcSurchargeOnBalance(balance, dueDate) {
  const bal = Number(balance || 0);
  if (bal <= 0) return 0;

  const days = lateDays(dueDate);
  if (days < SURCHARGE_AFTER_DAYS) return 0;

  return Math.round((SURCHARGE_PCT / 100) * bal);
}

// ✅ Date format d-m-yyyy
function fmtDMY(d) {
  const x = toDateOnlyAny(d);
  if (!x) return "";
  return `${x.getDate()}-${x.getMonth() + 1}-${x.getFullYear()}`;
}

// ===================== GET LEDGER (NOW WITH CHILD ROWS) =====================
router.get("/:contractId", async (req, res) => {
  try {
    const contractId = Number(req.params.contractId);
    if (!contractId)
      return res.status(400).json({ error: "Invalid contractId" });

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        user: true,
        unit: true,
        ledgerrow: {
          orderBy: { srNo: "asc" },
          include: {
            children: { orderBy: { lineNo: "asc" } }, // ✅ NEW
          },
        },
      },
    });

    if (!contract) return res.status(404).json({ error: "Contract not found" });

    return res.json({
      contract: {
        id: contract.id,
        clientName: contract.user?.name,
        email: contract.user?.email,
        phone: contract.user?.phone,
        unitNumber: contract.unit?.unitNumber,
        unitType: contract.unit?.unitType,
        project: contract.unit?.project,
        totalAmount: contract.totalAmount,
        downPayment: contract.downPayment || 0,
        months: contract.months,
        startDate: contract.startDate,
        bookingDate: contract.bookingDate,
        possession: contract.possession || 0,
      },
      rows: contract.ledgerrow || [],
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Failed to load ledger" });
  }
});

// ===================== SAVE LEDGER + CONTRACT HEADER (NOW WITH CHILD ROWS) =====================
router.put("/:contractId", async (req, res) => {
  try {
    const contractId = Number(req.params.contractId);
    if (!contractId)
      return res.status(400).json({ error: "Invalid contractId" });

    const rows = req.body?.rows;
    const contractPatch = req.body?.contract;

    if (!Array.isArray(rows))
      return res.status(400).json({ error: "rows must be an array" });

    const contractExists = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });
    if (!contractExists)
      return res.status(404).json({ error: "Contract not found" });

    // srNo unique
    const srSet = new Set();
    for (const r of rows) {
      const sr = Number(r.srNo);
      if (!sr)
        return res.status(400).json({ error: "Every row must have srNo" });
      if (srSet.has(sr))
        return res.status(400).json({ error: "srNo must be unique" });
      srSet.add(sr);
    }

    const normalized = rows.map((r) => ({
      id: r.id ? Number(r.id) : null,
      srNo: Number(r.srNo),
      description: String(r.description || "").trim(),
      installmentAmount: Number(r.installmentAmount || 0),
      dueDate: r.dueDate
        ? new Date(String(r.dueDate).slice(0, 10))
        : new Date(),
      amountPaid: Number(r.amountPaid || 0),
      paymentDate: r.paymentDate
        ? new Date(String(r.paymentDate).slice(0, 10))
        : null,
      paymentProof: r.paymentProof ? String(r.paymentProof) : null,
      instrumentType: r.instrumentType ? String(r.instrumentType) : null,
      instrumentNo: r.instrumentNo ? String(r.instrumentNo) : null,

      // ✅ NEW: child rows
      children: Array.isArray(r.children)
        ? r.children.map((c) => ({
            id: c.id ? Number(c.id) : null,
            lineNo: Number(c.lineNo || 0),
            description: String(c.description || "").trim(),
            amountPaid: Number(c.amountPaid || 0),
            paymentDate: c.paymentDate
              ? new Date(String(c.paymentDate).slice(0, 10))
              : null,
            paymentProof: c.paymentProof ? String(c.paymentProof) : null,
            instrumentType: c.instrumentType ? String(c.instrumentType) : null,
            instrumentNo: c.instrumentNo ? String(c.instrumentNo) : null,
          }))
        : [],
    }));

    // validate child lineNo unique per parent (only for incoming payload)
    for (const r of normalized) {
      const set = new Set();
      for (const c of r.children) {
        if (!c.lineNo) throw new Error("Each child row needs lineNo");
        if (set.has(c.lineNo)) throw new Error("Child lineNo must be unique");
        set.add(c.lineNo);
      }
    }

    const existingParents = await prisma.ledgerrow.findMany({
      where: { contractId },
      select: { id: true },
    });
    const existingParentIds = new Set(existingParents.map((x) => x.id));

    const incomingParentIds = new Set(
      normalized.filter((x) => x.id && !Number.isNaN(x.id)).map((x) => x.id)
    );
    const parentsToDelete = [...existingParentIds].filter(
      (id) => !incomingParentIds.has(id)
    );

    await prisma.$transaction(async (tx) => {
      // Update contract header
      if (contractPatch && typeof contractPatch === "object") {
        const data = {};
        if (contractPatch.totalAmount != null)
          data.totalAmount = Number(contractPatch.totalAmount || 0);
        if (contractPatch.downPayment != null)
          data.downPayment = Number(contractPatch.downPayment || 0);
        if (contractPatch.possession != null)
          data.possession = Number(contractPatch.possession || 0);
        if (contractPatch.months != null)
          data.months = Number(contractPatch.months || 0);

        if (data.months != null && data.months <= 0)
          throw new Error("Months must be greater than 0");

        if (Object.keys(data).length > 0) {
          await tx.contract.update({ where: { id: contractId }, data });
        }
      }

      // delete removed parent rows (children auto delete due to cascade)
      if (parentsToDelete.length > 0) {
        await tx.ledgerrow.deleteMany({
          where: { contractId, id: { in: parentsToDelete } },
        });
      }

      // update existing parent rows
      for (const r of normalized.filter(
        (x) => x.id && existingParentIds.has(x.id)
      )) {
        await tx.ledgerrow.update({
          where: { id: r.id },
          data: {
            srNo: r.srNo,
            description: r.description,
            installmentAmount: r.installmentAmount,
            dueDate: r.dueDate,
            amountPaid: r.amountPaid,
            paymentDate: r.paymentDate,
            paymentProof: r.paymentProof,
            instrumentType: r.instrumentType,
            instrumentNo: r.instrumentNo,
          },
        });
      }

      // create new parent rows (need ids to create children)
      const newParents = normalized.filter((x) => !x.id);
      let createdParents = [];
      if (newParents.length > 0) {
        // create one-by-one to get IDs (because children need ledgerRowId)
        for (const r of newParents) {
          const created = await tx.ledgerrow.create({
            data: {
              contractId,
              srNo: r.srNo,
              description: r.description,
              installmentAmount: r.installmentAmount,
              dueDate: r.dueDate,
              amountPaid: r.amountPaid,
              paymentDate: r.paymentDate,
              paymentProof: r.paymentProof,
              instrumentType: r.instrumentType,
              instrumentNo: r.instrumentNo,
            },
            select: { id: true, srNo: true },
          });
          createdParents.push({ ...created, __tmpSrNo: r.srNo });
        }
      }

      // ========== CHILD ROWS UPSERT ==========
      // For each parent row (existing + newly created) sync children
      // Strategy:
      // - read existing child ids per parent
      // - delete missing
      // - update existing
      // - create new
      const allParentIdMap = new Map(); // srNo -> parentId (for new ones)
      for (const p of normalized) {
        if (p.id) allParentIdMap.set(p.srNo, p.id);
      }
      for (const p of createdParents) {
        allParentIdMap.set(p.__tmpSrNo, p.id);
      }

      for (const parent of normalized) {
        const parentId = parent.id || allParentIdMap.get(parent.srNo);
        if (!parentId) continue;

        const incomingChildren = parent.children || [];

        const existingChildren = await tx.ledgerchildrow.findMany({
          where: { ledgerRowId: parentId },
          select: { id: true },
        });
        const existingChildIds = new Set(existingChildren.map((x) => x.id));
        const incomingChildIds = new Set(
          incomingChildren
            .filter((c) => c.id && !Number.isNaN(c.id))
            .map((c) => c.id)
        );

        const childToDelete = [...existingChildIds].filter(
          (id) => !incomingChildIds.has(id)
        );
        if (childToDelete.length > 0) {
          await tx.ledgerchildrow.deleteMany({
            where: { ledgerRowId: parentId, id: { in: childToDelete } },
          });
        }

        // update
        for (const c of incomingChildren.filter(
          (x) => x.id && existingChildIds.has(x.id)
        )) {
          await tx.ledgerchildrow.update({
            where: { id: c.id },
            data: {
              lineNo: c.lineNo,
              description: c.description,
              amountPaid: c.amountPaid,
              paymentDate: c.paymentDate,
              paymentProof: c.paymentProof,
              instrumentType: c.instrumentType,
              instrumentNo: c.instrumentNo,
            },
          });
        }

        // create
        const newChildren = incomingChildren.filter((x) => !x.id);
        if (newChildren.length > 0) {
          await tx.ledgerchildrow.createMany({
            data: newChildren.map((c) => ({
              ledgerRowId: parentId,
              lineNo: c.lineNo,
              description: c.description,
              amountPaid: c.amountPaid,
              paymentDate: c.paymentDate,
              paymentProof: c.paymentProof,
              instrumentType: c.instrumentType,
              instrumentNo: c.instrumentNo,
            })),
          });
        }
      }
    });

    const freshContract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { user: true, unit: true },
    });

    const freshRows = await prisma.ledgerrow.findMany({
      where: { contractId },
      orderBy: { srNo: "asc" },
      include: { children: { orderBy: { lineNo: "asc" } } }, // ✅ NEW
    });

    return res.json({
      ok: true,
      contract: {
        id: freshContract.id,
        clientName: freshContract.user?.name,
        email: freshContract.user?.email,
        phone: freshContract.user?.phone,
        unitNumber: freshContract.unit?.unitNumber,
        unitType: freshContract.unit?.unitType,
        project: freshContract.unit?.project,
        totalAmount: freshContract.totalAmount,
        downPayment: freshContract.downPayment || 0,
        months: freshContract.months,
        startDate: freshContract.startDate,
        bookingDate: freshContract.bookingDate,
        possession: freshContract.possession || 0,
      },
      rows: freshRows,
    });
  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ error: e.message || "Failed to save ledger" });
  }
});

// ===================== UPLOAD PAYMENT PROOF =====================
// ✅ Returns relative url: /uploads/payment-proofs/xxx.png
router.post(
  "/:contractId/upload-proof",
  uploadSingle("file"),
  async (req, res) => {
    try {
      const contractId = Number(req.params.contractId);
      if (!contractId)
        return res.status(400).json({ error: "Invalid contractId" });
      if (!req.file) return res.status(400).json({ error: "File missing" });

      const rowId = req.body?.rowId ? Number(req.body.rowId) : null;
      const srNo = req.body?.srNo ? Number(req.body.srNo) : null;

      const contract = await prisma.contract.findUnique({
        where: { id: contractId },
        select: { id: true },
      });
      if (!contract)
        return res.status(404).json({ error: "Contract not found" });

      const publicUrl = `/uploads/payment-proofs/${req.file.filename}`;

      if (rowId) {
        await prisma.ledgerrow.update({
          where: { id: rowId },
          data: { paymentProof: publicUrl },
        });
      } else if (srNo) {
        await prisma.ledgerrow.update({
          where: { contractId_srNo: { contractId, srNo } },
          data: { paymentProof: publicUrl },
        });
      }

      return res.json({ ok: true, url: publicUrl });
    } catch (e) {
      console.error(e);
      return res
        .status(500)
        .json({ error: e.message || "Failed to upload proof" });
    }
  }
);

// ===================== PDF EXPORT (UNCHANGED - STILL PARENTS ONLY) =====================
// ✅ Child rows do not change existing PDF functionality.
// (If later you want child rows in PDF, tell me.)
router.get("/:contractId/export/pdf", async (req, res) => {
  let browser;
  try {
    const contractId = Number(req.params.contractId);
    if (!contractId)
      return res.status(400).json({ error: "Invalid contractId" });

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        user: true,
        unit: true,
        ledgerrow: { orderBy: { srNo: "asc" } },
      },
    });
    if (!contract) return res.status(404).json({ error: "Contract not found" });

    const installments = (contract.ledgerrow || []).map((r) => {
      const inst = Number(r.installmentAmount || 0);
      const paid = Number(r.amountPaid || 0);
      const balance = Math.max(0, inst - paid);
      const lDays = lateDays(r.dueDate);
      const surcharge = calcSurchargeOnBalance(balance, r.dueDate);

      return {
        srNo: r.srNo,
        description: r.description || "",
        installmentAmount: inst,
        dueDate: r.dueDate ? fmtDMY(r.dueDate) : "",
        amountPaid: paid,
        paymentDate: r.paymentDate ? fmtDMY(r.paymentDate) : "",
        instrumentType: r.instrumentType || "",
        instrumentNo: r.instrumentNo || "",
        balance,
        surcharge,
        lateDays: lDays,
      };
    });

    const totalPayable = installments.reduce(
      (s, r) => s + Number(r.installmentAmount || 0),
      0
    );
    const totalPaid = installments.reduce(
      (s, r) => s + Number(r.amountPaid || 0),
      0
    );
    const totalReceivable = installments.reduce(
      (s, r) => s + Number(r.balance || 0),
      0
    );
    const totalSurcharge = installments.reduce(
      (s, r) => s + Number(r.surcharge || 0),
      0
    );
    const totalReceivableWithSurcharge = totalReceivable + totalSurcharge;

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: Arial, sans-serif; color:#0f172a; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 8px; }
    .titleWrap { flex:1; text-align:center; }
    .titleTop { font-weight:800; font-size:18px; margin:0; }
    .titleMid { font-weight:800; font-size:16px; margin:14px 0 0; letter-spacing:0.4px; }
    .metaTable { width:100%; border-collapse:collapse; margin-top:8px; font-size:12px; }
    .metaTable td { padding:6px 8px; border-bottom:1px solid #0f172a; }
    .metaLabel { font-weight:700; width:120px; }
    table.ledger { width:100%; border-collapse:collapse; font-size:11px; margin-top:12px; }
    .ledger th { background:#0f172a; color:white; text-align:left; padding:7px 8px; border:1px solid #0f172a; white-space:nowrap; }
    .ledger td { padding:7px 8px; border:1px solid #e5e7eb; vertical-align:top; }
    .right { text-align:right; white-space:nowrap; }
    .zebra:nth-child(even) td { background:#fbfdff; }
    .rowWarn td { background:#fff7ed; }
    .rowBad td { background:#fef2f2; }
    .totalFooter td{
      color:#ffffff !important;
      font-weight:900;
      border-color: rgba(255, 255, 255, 0.22);
      background: linear-gradient(135deg, #22c55e, #22c55e);
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="titleWrap">
      <div class="titleTop">Client Ledger</div>
      <div class="titleMid">ACCOUNT STATEMENT</div>
    </div>
  </div>

  <table class="metaTable">
    <tr>
      <td class="metaLabel">Name</td>
      <td>${esc(contract.user?.name || "")}</td>
      <td class="metaLabel">Reg #</td>
      <td>${contract.id}</td>
    </tr>
    <tr>
      <td class="metaLabel">Unit</td>
      <td>${esc(contract.unit?.unitNumber || "")} (${esc(
      contract.unit?.unitType || ""
    )})</td>
      <td class="metaLabel">Project</td>
      <td>${esc(contract.unit?.project || "")}</td>
    </tr>
    <tr>
      <td class="metaLabel">Total Amount</td>
      <td>${fmt(contract.totalAmount)}</td>
      <td class="metaLabel">Downpayment</td>
      <td>${fmt(contract.downPayment || 0)}</td>
    </tr>
  </table>

  <table class="ledger">
    <thead>
      <tr>
        <th>Sr No</th>
        <th>Description</th>
        <th class="right">Installment Amount</th>
        <th>Due Date</th>
        <th class="right">Installment Paid</th>
        <th>Payment Date</th>
        <th>Instrument Type</th>
        <th>Instrument No</th>
        <th class="right">Balance</th>
        <th class="right">Late Payment Surcharge</th>
        <th class="right">Late Payment Days</th>
      </tr>
    </thead>

    <tbody>
      ${installments
        .map((r) => {
          const lDays = Number(r.lateDays || 0);
          const surcharge = Number(r.surcharge || 0);
          const trClass =
            surcharge > 0 ? "rowBad" : lDays > 0 ? "rowWarn" : "zebra";
          const lateDaysCell = lDays > 0 ? `${lDays} day(s)` : "—";
          const surchargeCell = surcharge > 0 ? fmt(surcharge) : "—";
          return `
          <tr class="${trClass}">
            <td>${r.srNo || ""}</td>
            <td>${esc(r.description || "")}</td>
            <td class="right">${fmt(r.installmentAmount)}</td>
            <td>${r.dueDate || ""}</td>
            <td class="right">${fmt(r.amountPaid)}</td>
            <td>${r.paymentDate || ""}</td>
            <td>${esc(r.instrumentType || "")}</td>
            <td>${esc(r.instrumentNo || "")}</td>
            <td class="right">${fmt(r.balance)}</td>
            <td class="right">${surchargeCell}</td>
            <td class="right">${lateDaysCell}</td>
          </tr>`;
        })
        .join("")}

      <tr class="totalFooter">
        <td></td>
        <td></td>
        <td style="font-weight:900;">TOTAL</td>
        <td class="right" style="font-weight:900;">${fmt(totalPayable)}</td>
        <td></td>
        <td class="right" style="font-weight:900;">${fmt(totalPaid)}</td>
        <td></td>
        <td></td>
        <td class="right" style="font-weight:900;">${fmt(totalReceivable)}</td>
        <td class="right" style="font-weight:900;">${fmt(totalSurcharge)}</td>
        <td class="right" style="font-weight:900;">${fmt(
          totalReceivableWithSurcharge
        )}</td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;

    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
      scale: 0.88,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ledger-contract-${contractId}.pdf"`
    );
    return res.end(pdf);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "Failed to export pdf" });
  } finally {
    if (browser) await browser.close();
  }
});

module.exports = router;
