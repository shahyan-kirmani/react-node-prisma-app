// src/routes/clientLedger.js
const router = require("express").Router();
const prisma = require("../prisma");
const { auth, requireRole } = require("../middleware/auth");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

router.use(auth, requireRole("CLIENT"));

// ✅ Put your Avenue 18 logo file here:
const LOGO_PATH = path.join(
  __dirname,
  "..",              // routes -> src
  "uploads",
  "payment-proofs",
  "logoavenue18.png"
);


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

function fmtDMY(d) {
  if (!d) return "";
  const x = new Date(d);
  const dd = String(x.getDate()).padStart(2, "0");
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const yy = x.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

function computeReceivable(rows) {
  const sorted = [...(rows || [])].sort((a, b) => Number(a.srNo) - Number(b.srNo));

  let runningInstallment = 0;
  let runningPaid = 0;

  return sorted.map((r) => {
    const parentPaid = Number(r.amountPaid || 0);
    const childPaid = (r.children || []).reduce((s, c) => s + Number(c.amountPaid || 0), 0);
    const totalPaid = parentPaid + childPaid;

    runningInstallment += Number(r.installmentAmount || 0);
    runningPaid += totalPaid;

    return {
      ...r,
      totalPaid,
      amountReceivable: Math.max(runningInstallment - runningPaid, 0),
    };
  });
}

// ✅ Helper: embed logo as base64 so PDF always shows it
function getLogoDataUri() {
  try {
    if (!fs.existsSync(LOGO_PATH)) return ""; // logo missing
    const buf = fs.readFileSync(LOGO_PATH);
    const b64 = buf.toString("base64");
    return `data:image/png;base64,${b64}`;
  } catch (e) {
    console.error("LOGO READ ERROR:", e);
    return "";
  }
}

/**
 * ✅ GET /api/client/ledger
 */
router.get("/", async (req, res) => {
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const contract = await prisma.contract.findFirst({
      where: { clientId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        user: true,
        unit: true,
        ledgerrow: {
          orderBy: { srNo: "asc" },
          include: { children: { orderBy: { lineNo: "asc" } } },
        },
      },
    });

    if (!contract) return res.status(404).json({ error: "No contract found" });

    return res.json({
      contract: {
        contractId: contract.id,
        clientName: contract.user?.name || "",
        unitNumber: contract.unit?.unitNumber || "",
        unitType: contract.unit?.unitType || "",
        project: contract.unit?.project || "",
        totalAmount: contract.totalAmount,
        downPayment: contract.downPayment || 0,
        possession: contract.possession || 0,
        months: contract.months,
        bookingDate: contract.bookingDate || null,
        startDate: contract.startDate || null,
      },
      rows: computeReceivable(contract.ledgerrow),
    });
  } catch (e) {
    console.error("CLIENT LEDGER ERROR:", e);
    return res.status(500).json({ error: e.message || "Failed to fetch ledger" });
  }
});

/**
 * ✅ GET /api/client/ledger/export/pdf
 * ✅ Add Avenue 18 logo (left) + Print Date (right)
 */
router.get("/export/pdf", async (req, res) => {
  let browser;
  try {
    const userId = Number(req.user?.id);
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const contract = await prisma.contract.findFirst({
      where: { clientId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        user: true,
        unit: true,
        ledgerrow: {
          orderBy: { srNo: "asc" },
          include: { children: { orderBy: { lineNo: "asc" } } },
        },
      },
    });

    if (!contract) return res.status(404).json({ error: "No contract found" });

    const rows = computeReceivable(contract.ledgerrow || []);

    const totalPaid = rows.reduce((s, r) => s + Number(r.totalPaid || 0), 0);
    const totalReceivable = rows.reduce((s, r) => {
      const inst = Number(r.installmentAmount || 0);
      const paidAll = Number(r.totalPaid || 0);
      return s + Math.max(0, inst - paidAll);
    }, 0);

    const totalSurcharge = rows.reduce((s, r) => s + Number(r.latePaymentSurcharge || 0), 0);
    const totalDue = totalReceivable + totalSurcharge;

    const printedOn = fmtDMY(new Date());

    // ✅ Embed Avenue 18 logo
    const logoDataUri = getLogoDataUri();

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    body { font-family: Arial, sans-serif; color:#0f172a; }

    .header {
      display:flex;
      justify-content:space-between;
      align-items:center;
      margin-bottom: 8px;
      gap: 10px;
    }
    .logoWrap { width: 180px; display:flex; align-items:center; }
    .logoImg { height: 52px; width:auto; object-fit:contain; }
    .titleWrap { flex:1; text-align:center; }
    .titleTop { font-weight:800; font-size:18px; margin:0; }
    .titleMid { font-weight:800; font-size:16px; margin:14px 0 0; letter-spacing:0.4px; }
    .printWrap { width: 180px; text-align:right; font-size:11px; font-weight:700; color:#0f172a; }

    .metaTable { width:100%; border-collapse:collapse; margin-top:8px; font-size:12px; }
    .metaTable td { padding:6px 8px; border-bottom:1px solid #0f172a; }
    .metaLabel { font-weight:700; width:120px; }

    table.ledger { width:100%; border-collapse:collapse; font-size:11px; margin-top:12px; }
    .ledger th { background:#0f172a; color:white; text-align:left; padding:7px 8px; border:1px solid #0f172a; white-space:nowrap; }
    .ledger td { padding:7px 8px; border:1px solid #e5e7eb; vertical-align:top; }
    .right { text-align:right; white-space:nowrap; }
    .child { background:#f8fafc; font-size:10px; }

    .totalFooter td{
      color:#ffffff !important;
      font-weight:900;
      border-color: rgba(255, 255, 255, 0.22);
      background: #16a34a;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logoWrap">
      ${
        logoDataUri
          ? `<img class="logoImg" src="${logoDataUri}" alt="Avenue 18 Logo" />`
          : `<div style="font-size:11px;color:#64748b;font-weight:700;">Logo not found</div>`
      }
    </div>

    <div class="titleWrap">
      <div class="titleTop">Client Ledger</div>
      <div class="titleMid">ACCOUNT STATEMENT</div>
    </div>

    <div class="printWrap">Printed on: ${printedOn}</div>
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
      <td>${esc(contract.unit?.unitNumber || "")} (${esc(contract.unit?.unitType || "")})</td>
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
        <th>Sr</th>
        <th>Description</th>
        <th class="right">Installment</th>
        <th>Due Date</th>
        <th class="right">Paid (Total)</th>
        <th>Payment Date</th>
        <th class="right">Balance</th>
        <th class="right">Locked Surcharge</th>
        <th class="right">Total Due</th>
      </tr>
    </thead>

    <tbody>
      ${rows
        .map((r) => {
          const inst = Number(r.installmentAmount || 0);
          const paidAll = Number(r.totalPaid || 0);
          const bal = Math.max(0, inst - paidAll);

          const sc = Number(r.latePaymentSurcharge || 0);
          const tdue = bal + sc;

          const parentRow = `
            <tr>
              <td>${r.srNo || ""}</td>
              <td>${esc(r.description || "")}</td>
              <td class="right">${fmt(inst)}</td>
              <td>${r.dueDate ? fmtDMY(r.dueDate) : ""}</td>
              <td class="right">${fmt(paidAll)}</td>
              <td>${r.paymentDate ? fmtDMY(r.paymentDate) : "—"}</td>
              <td class="right">${fmt(bal)}</td>
              <td class="right">${fmt(sc)}</td>
              <td class="right">${fmt(tdue)}</td>
            </tr>
          `;

          const childRows = (r.children || [])
            .map(
              (c) => `
              <tr class="child">
                <td>↳ ${c.lineNo || ""}</td>
                <td>${esc(c.description || "Child Payment")}</td>
                <td class="right">—</td>
                <td>—</td>
                <td class="right">${fmt(c.amountPaid || 0)}</td>
                <td>${c.paymentDate ? fmtDMY(c.paymentDate) : "—"}</td>
                <td class="right">—</td>
                <td class="right">—</td>
                <td class="right">—</td>
              </tr>
            `
            )
            .join("");

          return parentRow + childRows;
        })
        .join("")}

      <tr class="totalFooter">
        <td colspan="4" style="font-weight:900;">TOTALS</td>
        <td class="right" style="font-weight:900;">${fmt(totalPaid)}</td>
        <td></td>
        <td class="right" style="font-weight:900;">${fmt(totalReceivable)}</td>
        <td class="right" style="font-weight:900;">${fmt(totalSurcharge)}</td>
        <td class="right" style="font-weight:900;">${fmt(totalDue)}</td>
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
    res.setHeader("Content-Disposition", `attachment; filename="ledger.pdf"`);
    return res.end(pdf);
  } catch (e) {
    console.error("CLIENT PDF ERROR:", e);
    return res.status(500).json({ error: e.message || "Failed to export pdf" });
  } finally {
    if (browser) await browser.close();
  }
});

module.exports = router;
