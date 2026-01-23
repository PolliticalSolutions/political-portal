import { NavLink, Outlet } from "react-router-dom";

export default function PortalLayout() {
  const navClass = ({ isActive }) => (isActive ? "navLink active" : "navLink");

  return (
    <div className="page stack">
      <div className="no-print" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Portal</div>
        <nav className="nav" aria-label="Portal">
          <NavLink className={navClass} to="/portal" end>
            Dashboard
          </NavLink>
          <NavLink className={navClass} to="/portal/pricing-rules">
            Pricing rules
          </NavLink>
          <NavLink className={navClass} to="/portal/settings/integrations">
            Integrations
          </NavLink>
          <NavLink className={navClass} to="/portal/ops/quotes">
            Ops quotes
          </NavLink>
          <NavLink className={navClass} to="/portal/subscriptions">
            Subscriptions
          </NavLink>
          <NavLink className={navClass} to="/services">
            Services
          </NavLink>
          <NavLink className={navClass} to="/portal/cart">
            Cart
          </NavLink>
        </nav>
      </div>
      <Outlet />
    </div>
  );
}
