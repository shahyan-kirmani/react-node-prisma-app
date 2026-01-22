import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { setAuth } from "../auth";

// ✅ Vite image imports
import logo from "../assets/images/developmentlogo.png";
import sideImage from "../assets/images/Avenue18.jpg";

export default function Register({ setSession }) {
  const navigate = useNavigate();

  const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5050";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ✅ Role dropdown state
  const [role, setRole] = useState("CLIENT");

  // ✅ Admin / Acquisition code (only required for ACQUISITION)
  const [adminCode, setAdminCode] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!name || !email || !password) {
      alert("Please fill all fields");
      return;
    }

    // ✅ If Acquisition selected, code required
    if (role === "ACQUISITION" && !adminCode.trim()) {
      alert("Please enter Acquisition code");
      return;
    }

    try {
      const payload = {
        name,
        email,
        password,
        role,
        // ✅ send adminCode only when role is ACQUISITION
        ...(role === "ACQUISITION" ? { adminCode: adminCode.trim() } : {}),
      };

      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      // ✅ Handle backend errors safely
      if (!res.ok) {
        alert(data.message || data.error || "Register failed");
        return;
      }

      // ✅ Must have token + user
      if (!data.token || !data.user) {
        alert("Register response missing token/user");
        return;
      }

      // ✅ Save session
      setAuth(data.token, data.user);
      setSession({ token: data.token, user: data.user });

      // ✅ Redirect by role
      if (data.user.role === "ACQUISITION") navigate("/admin");
      else navigate("/client");
    } catch (err) {
      alert("Backend not reachable. Is it running on 5050?");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card} className="register-card-grid">
        {/* LEFT */}
        <div style={styles.left} className="register-left">
          <img src={logo} alt="Makkaan Developments" style={styles.logo} />

          <h1 style={styles.title} className="register-title">
            Create Account
          </h1>

          <p style={styles.subtitle}>Register to access the portal</p>

          <form onSubmit={handleRegister} style={styles.form}>
            <label style={styles.label}>Full Name</label>
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              autoComplete="name"
            />

            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              placeholder="name@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              autoComplete="email"
            />

            <label style={styles.label}>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              autoComplete="new-password"
            />

            {/* ✅ Role dropdown */}
            <label style={styles.label}>Role</label>
            <select
              value={role}
              onChange={(e) => {
                const v = e.target.value;
                setRole(v);
                // optional: clear code when switching away
                if (v !== "ACQUISITION") setAdminCode("");
              }}
              style={styles.input}
            >
              <option value="CLIENT">CLIENT</option>
              <option value="ACQUISITION">ACQUISITION</option>
            </select>

            {/* ✅ Only show when ACQUISITION selected */}
            {role === "ACQUISITION" && (
              <>
                <label style={styles.label}>Acquisition Code</label>
                <input
                  type="password"
                  placeholder="Enter acquisition/admin code"
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value)}
                  style={styles.input}
                  autoComplete="off"
                />
              </>
            )}

            <button type="submit" style={styles.button}>
              Register
            </button>

            <div style={{ marginTop: "14px", fontSize: "13px" }}>
              <span style={{ color: "#64748b" }}>Already have an account?</span>{" "}
              <Link
                to="/login"
                style={{
                  color: "#2563eb",
                  fontWeight: "700",
                  textDecoration: "none",
                }}
              >
                Login
              </Link>
            </div>

            <div style={styles.footer}>
              © {new Date().getFullYear()} Makkaan Developments
            </div>
          </form>
        </div>

        {/* RIGHT - background image */}
        <div style={styles.right} className="register-right">
          <div style={styles.rightOverlay} />
        </div>
      </div>

      {/* ✅ Mobile responsiveness */}
      <style>{`
        @media (max-width: 900px){
          .register-card-grid{
            grid-template-columns: 1fr !important;
            min-height: auto !important;
          }
          .register-right{
            order: -1;
            min-height: 240px !important;
            border-radius: 22px 22px 0 0 !important;
          }
          .register-left{
            padding: 26px 20px 28px !important;
          }
          .register-title{
            font-size: 28px !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ---------------- STYLES ---------------- */

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "18px",
    background:
      "radial-gradient(1200px 600px at 20% 10%, #eef3ff 0%, #f5f7ff 35%, #eef2ff 100%)",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  },

  card: {
    width: "min(1100px, 100%)",
    minHeight: "620px",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    background: "#ffffff",
    borderRadius: "22px",
    overflow: "hidden",
    boxShadow: "0 22px 60px rgba(15, 23, 42, 0.18)",
  },

  left: {
    padding: "48px 46px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  },

  logo: {
    width: "180px",
    height: "auto",
    marginBottom: "10px",
  },

  title: {
    margin: "0",
    fontSize: "34px",
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: "-0.5px",
  },

  subtitle: {
    margin: "5px 0 22px",
    color: "#64748b",
    fontSize: "14.5px",
  },

  form: {
    maxWidth: "440px",
  },

  label: {
    display: "block",
    fontSize: "13px",
    color: "#334155",
    margin: "0 0 5px",
    fontWeight: "600",
  },

  input: {
    width: "100%",
    padding: "14px 14px",
    marginBottom: "14px",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    fontSize: "14px",
    outline: "none",
    backgroundColor: "#fff",
  },

  button: {
    width: "100%",
    padding: "14px 16px",
    border: "none",
    borderRadius: "12px",
    background: "#16a34a",
    color: "#ffffff",
    fontWeight: "800",
    fontSize: "15px",
    cursor: "pointer",
    marginTop: "6px",
  },

  footer: {
    marginTop: "18px",
    color: "#94a3b8",
    fontSize: "12px",
  },

  right: {
    position: "relative",
    backgroundImage: `url(${sideImage})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    borderRadius: "0 22px 22px 0",
  },

  rightOverlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(135deg, rgba(15,23,42,0.15), rgba(109,40,217,0.35))",
  },
};
