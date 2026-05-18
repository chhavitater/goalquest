// src/Login.jsx
import { useState } from "react";
import { authApi, saveToken } from "./api";

export default function Login({ onLogin }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr]           = useState("");
  const [loading, setLoading]   = useState(false);

  const DEMOS = [
    { label: "Employee",  email: "employee@demo.com", password: "emp123" },
    { label: "Manager",   email: "manager@demo.com",  password: "manager123" },
    { label: "Admin",     email: "admin@demo.com",    password: "admin123" },
  ];

  async function handleLogin(e) {
    e?.preventDefault();
    setErr(""); setLoading(true);
    try {
      const { token, user } = await authApi.login(email, password);
      saveToken(token);
      onLogin(user);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setLoading(false);
    }
  }

  function quickLogin(demo) {
    setEmail(demo.email);
    setPassword(demo.password);
    // Slight delay so state updates before submit
    setTimeout(() => authApi.login(demo.email, demo.password).then(({ token, user }) => {
      saveToken(token); onLogin(user);
    }).catch(ex => setErr(ex.message)), 100);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, background: "#1d4ed8", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, margin: "0 auto 12px" }}>⚡</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#111827" }}>GoalQuest</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>Performance Portal · FY 2025-26</p>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 28 }}>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                style={{ width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8, fontSize: 14, boxSizing: "border-box" }} />
            </div>
            {err && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px", color: "#dc2626", fontSize: 13, marginBottom: 12 }}>⚠ {err}</div>}
            <button type="submit" disabled={loading}
              style={{ width: "100%", padding: "11px", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.7 : 1 }}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div style={{ marginTop: 24 }}>
            <p style={{ fontSize: 12, color: "#9ca3af", textAlign: "center", marginBottom: 10 }}>— Quick demo login —</p>
            <div style={{ display: "flex", gap: 8 }}>
              {DEMOS.map(d => (
                <button key={d.label} onClick={() => quickLogin(d)}
                  style={{ flex: 1, padding: "8px 4px", background: "#f3f4f6", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#374151" }}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
