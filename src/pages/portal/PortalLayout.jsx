import { NavLink, Outlet } from "react-router-dom";

export default function PortalLayout() {
  const navClass = ({ isActive }) => (isActive ? "navLink active" : "navLink");

  return (
    <div className="page stack">
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Portal</div>
        <nav className="nav" aria-label="Portal">
          <NavLink className={navClass} to="/portal" end>
            Home
          </NavLink>
          <NavLink className={navClass} to="/portal/pricing-rules">
            Pricing rules
          </NavLink>
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
