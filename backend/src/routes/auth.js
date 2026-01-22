const router = require("express").Router();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../prisma");

// REGISTER (email based) + ✅ ROLE WITH ADMIN CODE
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, adminCode } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "name, email, password are required" });
    }

    const emailLower = String(email).toLowerCase().trim();

    // ✅ Check duplicate email
    const existing = await prisma.user.findUnique({
      where: { email: emailLower },
      select: { id: true },
    });

    if (existing) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // ✅ Decide role safely
    let finalRole = "CLIENT";
    if (role === "ACQUISITION") {
      if (!adminCode || adminCode !== process.env.ADMIN_CODE) {
        return res.status(403).json({ message: "Invalid admin code" });
      }
      finalRole = "ACQUISITION";
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email: emailLower,
        passwordHash,
        role: finalRole, // ✅ role set here
      },
      select: { id: true, name: true, email: true, role: true },
    });

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({ token, user });
  } catch (err) {
    console.error("REGISTER ERROR:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

// LOGIN (email based)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "email and password required" });
    }

    const emailLower = String(email).toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: emailLower },
    });

    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});

module.exports = router;
