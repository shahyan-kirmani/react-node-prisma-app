// SidebarLayout.jsx (WITH TOGGLE)
// ✅ Sidebar open/close toggle
// ✅ When closed => main becomes full width (table full screen)
// ✅ Overlay on mobile
import { useEffect, useState } from "react";
import "./sidebar.css";

export default function SidebarLayout({
  title,
  subtitle,
  navItems,
  activeKey,
  onNav,
  user,
  onLogout,
  children,
}) {
  const initials = (user?.name || "U").trim().slice(0, 1).toUpperCase();

  const [sidebarOpen, setSidebarOpen] = useState(true);

  // ✅ On mobile, default closed
  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 980px)").matches;
    if (isMobile) setSidebarOpen(false);
  }, []);

  return (
    <div className={`shell ${sidebarOpen ? "sb-open" : "sb-closed"}`}>
      {/* ✅ Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="sidebarInner">
          {/* BRAND */}
          <div className="brand">
            <div className="brandIcon">🏢</div>
            <div>
              <div className="brandTitle">Avenue 18</div>
              <div className="brandSub">Client Portal</div>
            </div>
          </div>

          {/* NAV */}
          <nav className="nav" aria-label="Sidebar navigation">
            {navItems.map((it) => (
              <div
                key={it.key}
                className={`navItem ${activeKey === it.key ? "active" : ""}`}
                onClick={() => onNav(it.key)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onNav(it.key);
                }}
              >
                <span style={{ width: 20 }}>{it.icon}</span>
                <span>{it.label}</span>
              </div>
            ))}
          </nav>

          {/* USER BOX */}
          <div className="userBox">
            <div className="userRow">
              <div className="avatar">{initials}</div>
              <div>
                <div className="userName">{user?.name}</div>
                <div className="userEmail">{user?.email}</div>
              </div>
            </div>

            <div
              className="logout"
              onClick={onLogout}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onLogout?.();
              }}
            >
              <span>⤴</span> <span>Logout</span>
            </div>
          </div>
        </div>
      </aside>

      {/* ✅ Dark overlay on mobile when sidebar open */}
      <div
        className={`sbOverlay ${sidebarOpen ? "show" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* MAIN */}
      <main className="main">
        <div className="topbar">
          <div className="topbarLeft">
            {/* ✅ Toggle button */}
            <button
              className="sbToggle"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
              title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              ☰
            </button>

            <div>
              <h1 className="pageTitle">{title}</h1>
              <p className="pageSub">{subtitle}</p>
            </div>
          </div>

          {children?.topRight}
        </div>

        <div className="container">{children?.content}</div>
      </main>
    </div>
  );
}
