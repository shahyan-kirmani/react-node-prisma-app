import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useMemo, useState } from "react";
import { getAuth, clearAuth } from "./auth";

import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import AdminClients from "./pages/AdminClients";
import AdminLedger from "./pages/AdminLedger";

import ClientDashboard from "./pages/ClientDashboard";

function Protected({ session, allow, children }) {
  if (!session.token || !session.user) return <Navigate to="/login" replace />;
  if (allow && session.user.role !== allow)
    return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const initial = useMemo(() => getAuth(), []);
  const [session, setSession] = useState({
    token: initial.token,
    user: initial.user,
  });

  function onLogout() {
    clearAuth();
    setSession({ token: null, user: null });
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />

        <Route path="/login" element={<Login setSession={setSession} />} />

        {/* ---------------- ADMIN ROUTES ---------------- */}
        <Route
          path="/admin"
          element={
            <Protected session={session} allow="ACQUISITION">
              <AdminDashboard
                token={session.token}
                user={session.user}
                onLogout={onLogout}
              />
            </Protected>
          }
        />

        <Route
          path="/admin/clients"
          element={
            <Protected session={session} allow="ACQUISITION">
              <AdminClients
                token={session.token}
                user={session.user}
                onLogout={onLogout}
              />
            </Protected>
          }
        />

        {/* ✅ LEDGER PAGE (ADMIN) */}
        <Route
          path="/admin/ledger/:contractId"
          element={
            <Protected session={session} allow="ACQUISITION">
              <AdminLedger
                token={session.token}
                user={session.user}
                onLogout={onLogout}
              />
            </Protected>
          }
        />

        {/* ---------------- CLIENT ROUTES ---------------- */}
        <Route
          path="/client"
          element={
            <Protected session={session} allow="CLIENT">
              <ClientDashboard
                token={session.token}
                user={session.user}
                onLogout={onLogout}
              />
            </Protected>
          }
        />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
