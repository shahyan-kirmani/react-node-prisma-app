const router = require("express").Router();
const prisma = require("../prisma");
const { auth, requireRole } = require("../middleware/auth");

router.use(auth, requireRole("ACQUISITION"));

// create unit
router.post("/units", async (req, res) => {
  const { project, unitNumber, unitSize } = req.body;
  const unit = await prisma.unit.create({
    data: { project, unitNumber, unitSize: Number(unitSize) },
  });
  res.json(unit);
});

// create contract
router.post("/contracts", async (req, res) => {
  const { clientId, unitId, totalAmount, downpaymentPct, startDate, months } =
    req.body;

  const contract = await prisma.contract.create({
    data: {
      clientId: Number(clientId),
      unitId: Number(unitId),
      totalAmount: Number(totalAmount),
      downpaymentPct: Number(downpaymentPct),
      startDate: new Date(startDate),
      months: months ? Number(months) : 48,
    },
  });

  res.json(contract);
});

// generate schedule (monthly)
router.post("/contracts/:id/generate-schedule", async (req, res) => {
  const contractId = Number(req.params.id);
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
  });
  if (!contract) return res.status(404).json({ error: "Contract not found" });

  const months = contract.months || 48;
  const installmentAmount = Math.round(
    (contract.totalAmount * (100 - contract.downpaymentPct)) / 100 / months
  );

  // remove old schedule (optional)
  await prisma.installmentSchedule.deleteMany({ where: { contractId } });

  const rows = [];
  const d0 = new Date(contract.startDate);

  for (let i = 1; i <= months; i++) {
    const due = new Date(d0);
    due.setMonth(due.getMonth() + i);

    rows.push({
      contractId,
      srNo: i,
      title: `${i}th INSTALLMENT`,
      dueDate: due,
      installmentAmount,
    });
  }

  await prisma.installmentSchedule.createMany({ data: rows });

  res.json({ ok: true, months, installmentAmount });
});

// add payment
router.post("/payments", async (req, res) => {
  const { scheduleId, paidAmount, paymentDate, proofUrl, referenceNo, notes } =
    req.body;

  const payment = await prisma.payment.create({
    data: {
      scheduleId: Number(scheduleId),
      paidAmount: Number(paidAmount),
      paymentDate: new Date(paymentDate),
      proofUrl: proofUrl || null,
      referenceNo: referenceNo || null,
      notes: notes || null,
      createdById: req.user.id,
    },
  });

  res.json(payment);
});

module.exports = router;
