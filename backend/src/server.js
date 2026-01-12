require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/auth");
const acqRoutes = require("./routes/acquisition");
const clientRoutes = require("./routes/client");
const adminRoutes = require("./routes/admin");
const adminClientsRoutes = require("./routes/adminClients");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (_, res) =>
  res.json({ ok: true, service: "ledger-portal-backend" })
);

app.use("/api/auth", authRoutes);
app.use("/api/acq", acqRoutes);
// app.use("/api/client", clientRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin/clients", adminClientsRoutes);
app.use("/api/admin/ledger", require("./routes/adminLedger"));
app.use("/api/client/ledger", require("./routes/clientLedger"));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () =>
  console.log(`Backend running on http://localhost:${PORT}`)
);
