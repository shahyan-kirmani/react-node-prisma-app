import { useState } from "react";
import { api } from "../api";
import { setAuth } from "../auth";
import { useNavigate } from "react-router-dom";

export default function Login({ setSession }) {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await api().post("/api/auth/login", { email, password });
      setAuth(res.data.token, res.data.user);
      setSession({ token: res.data.token, user: res.data.user });

      if (res.data.user.role === "ACQUISITION") nav("/admin");
      else nav("/client");
    } catch (e) {
      setErr(e.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{ maxWidth: 420, margin: "80px auto", padding: 18 }}
      className="card"
    >
      <h2 style={{ margin: 0 }}>Ledger Portal</h2>
      <p style={{ marginTop: 8, color: "#64748b" }}>Login to continue</p>

      <form onSubmit={submit}>
        <input
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            marginBottom: 10,
          }}
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            marginBottom: 10,
          }}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {err && (
          <div
            style={{
              background: "#ffe7e7",
              padding: 10,
              borderRadius: 10,
              marginBottom: 10,
            }}
          >
            {err}
          </div>
        )}

        <button className="btn" style={{ width: "100%" }} disabled={loading}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
