const router = require("express").Router();
const prisma = require("../prisma");
const { auth, requireRole } = require("../middleware/auth");

router.use(auth, requireRole("ACQUISITION"));

/**
 * LIST CLIENTS (Contracts summary)
 * GET /api/admin/clients
 */
router.get("/clients", async (req, res) => {
  try {
    const contracts = await prisma.contract.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: true, // ✅ relation is "user" (not "client")
        unit: true,
      },
    });

    const rows = contracts.map((c) => ({
      contractId: c.id,
      clientId: c.clientId,
      clientName: c.user?.name || "", // ✅ c.user (not c.client)
      clientEmail: c.user?.email || "", // ✅ c.user (not c.client)
      project: c.unit?.project || "",
      unitNumber: c.unit?.unitNumber || "",
      unitSize: c.unit?.unitSize || "",
      totalAmount: c.totalAmount,
      downpaymentPct: c.downpaymentPct,
      months: c.months,
      startDate: c.startDate,
    }));

    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load clients" });
  }
});

/**
 * LEDGER BY CONTRACT (Admin view)
 * GET /api/admin/contracts/:id/ledger
 */
router.get("/contracts/:id/ledger", async (req, res) => {
  try {
    const contractId = Number(req.params.id);

    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        user: true, // ✅ relation is "user" (not "client")
        unit: true,

        // ✅ Keeping your same names here (schedule/payments)
        // If your schema is actually "installmentschedule", tell me and I'll align it.
        schedule: {
          orderBy: { dueDate: "asc" },
          include: { payments: { orderBy: { paymentDate: "desc" } } },
        },
      },
    });

    if (!contract) return res.status(404).json({ error: "Contract not found" });

    const totalAmount = contract.totalAmount;
    let runningPaid = 0;

    const rows = (contract.schedule || []).map((s) => {
      const paid = (s.payments || []).reduce(
        (sum, p) => sum + (p.paidAmount || 0),
        0
      );
      runningPaid += paid;
      const lastPayment = (s.payments && s.payments[0]) || null;

      return {
        scheduleId: s.id,
        srNo: s.srNo,
        description: s.title,
        installmentAmount: s.installmentAmount,
        dueDate: s.dueDate,
        amountPaid: paid,
        paymentDate: lastPayment ? lastPayment.paymentDate : null,
        amountReceivable: totalAmount - runningPaid,
        paymentProof: lastPayment ? lastPayment.proofUrl : null,
      };
    });

    res.json({
      contract: {
        contractId: contract.id,
        clientName: contract.user?.name || "", // ✅ contract.user
        clientEmail: contract.user?.email || "", // ✅ contract.user
        unitNumber: contract.unit?.unitNumber || "",
        unitSize: contract.unit?.unitSize || "",
        project: contract.unit?.project || "",
        totalAmount: contract.totalAmount,
        downpaymentPct: contract.downpaymentPct,
        months: contract.months,
      },
      rows,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load ledger" });
  }
});

module.exports = router;
