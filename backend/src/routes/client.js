const router = require("express").Router();
const prisma = require("../prisma");
const { auth } = require("../middleware/auth");

router.use(auth);

router.get("/ledger", async (req, res) => {
  const userId = req.user.id;

  const contract = await prisma.contract.findFirst({
    where: { clientId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      client: true,
      unit: true,
    },
  });

  if (!contract) return res.json({ contract: null, rows: [] });

  // ✅ If manual ledger rows exist, show those
  const manualRows = await prisma.ledgerRow.findMany({
    where: { contractId: contract.id },
    orderBy: { srNo: "asc" },
  });

  if (manualRows.length > 0) {
    let runningPaid = 0;
    const rows = manualRows.map((r) => {
      runningPaid += r.amountPaid || 0;
      return {
        srNo: r.srNo,
        description: r.description,
        installmentAmount: r.installmentAmount,
        dueDate: r.dueDate,
        amountPaid: r.amountPaid,
        paymentDate: r.paymentDate,
        amountReceivable: contract.totalAmount - runningPaid,
        paymentProof: r.paymentProof,
      };
    });

    return res.json({
      contract: {
        clientName: contract.client.name,
        unitNumber: contract.unit.unitNumber,
        unitSize: contract.unit.unitSize,
        project: contract.unit.project,
        totalAmount: contract.totalAmount,
        downpaymentPct: contract.downpaymentPct,
        months: contract.months,
      },
      rows,
    });
  }

  // Otherwise fallback to old schedule system (if you still want)
  return res.json({
    contract: {
      clientName: contract.client.name,
      unitNumber: contract.unit.unitNumber,
      unitSize: contract.unit.unitSize,
      project: contract.unit.project,
      totalAmount: contract.totalAmount,
      downpaymentPct: contract.downpaymentPct,
      months: contract.months,
    },
    rows: [],
  });
});

module.exports = router;
