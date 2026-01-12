const router = require("express").Router();
const prisma = require("../prisma");
const { auth, requireRole } = require("../middleware/auth");

router.use(auth, requireRole("CLIENT"));

function computeReceivable(rows) {
  const sorted = [...(rows || [])].sort(
    (a, b) => Number(a.srNo) - Number(b.srNo)
  );
  let runningInstallment = 0;
  let runningPaid = 0;

  return sorted.map((r) => {
    runningInstallment += Number(r.installmentAmount || 0);
    runningPaid += Number(r.amountPaid || 0);

    return {
      ...r,
      amountReceivable: Math.max(runningInstallment - runningPaid, 0),
    };
  });
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
        ledgerrow: { orderBy: { srNo: "asc" } },
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
    return res
      .status(500)
      .json({ error: e.message || "Failed to fetch ledger" });
  }
});

module.exports = router;
