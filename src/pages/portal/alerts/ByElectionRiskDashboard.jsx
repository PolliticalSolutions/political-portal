import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import Card from "../../../components/Card.jsx";
import { usePermissions } from "../../../context/PermissionsContext.jsx";
import { getAllByElectionAlerts, getByElectionAlertsForConstituencies } from "./byElectionRiskApi.js";

function StatusBadge({ status }) {
  if (status === "vacant") {
    return <span className="status-pill error" style={{ background: "#7f1d1d", color: "#fff" }}>Vacant</span>;
  }
  if (status === "critical") {
    return <span className="status-pill error">Critical</span>;
  }
  return <span className="status-pill warning">Elevated</span>;
}

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function ByElectionRiskDashboard() {
  const { isAdmin, allowedConstituencies, loading: permissionsLoading } = usePermissions();

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRegion, setFilterRegion] = useState("all");
  const [filterParty, setFilterParty] = useState("all");

  useEffect(() => {
    if (permissionsLoading) return;

    let active = true;
    setLoading(true);
    setError("");

    const fetch = isAdmin
      ? getAllByElectionAlerts()
      : getByElectionAlertsForConstituencies((allowedConstituencies ?? []).map(c => c.id));

    fetch
      .then(data => { if (active) { setAlerts(data); setLoading(false); } })
      .catch(err => { if (active) { setError(err.message || "Failed to load alerts."); setLoading(false); } });

    return () => { active = false; };
  }, [isAdmin, allowedConstituencies, permissionsLoading]);

  const regions = useMemo(
    () => ["all", ...[...new Set(alerts.map(a => a.region).filter(Boolean))].sort()],
    [alerts]
  );
  const parties = useMemo(
    () => ["all", ...[...new Set(alerts.map(a => a.party).filter(Boolean))].sort()],
    [alerts]
  );

  const filtered = useMemo(() => alerts.filter(a => {
    if (filterStatus !== "all" && a.riskStatus !== filterStatus) return false;
    if (filterRegion !== "all" && a.region !== filterRegion) return false;
    if (filterParty !== "all" && a.party !== filterParty) return false;
    return true;
  }), [alerts, filterStatus, filterRegion, filterParty]);

  const filtersActive = filterStatus !== "all" || filterRegion !== "all" || filterParty !== "all";

  return (
    <div className="page stack">
      <Helmet><title>By-Election Early Warning | Political Solutions</title></Helmet>

      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Intelligence</span>
            <h1 className="portal-page-header__title">By-Election Early Warning</h1>
          </div>
        </div>

        {isAdmin && (
          <div className="portal-admin-banner" style={{ marginTop: 16 }}>
            Showing all by-election risk alerts nationally
          </div>
        )}

        <p className="portal-data-note" style={{ marginTop: 16, marginBottom: 0 }}>
          Under Section 85, Local Government Act 1972, a councillor who fails to attend any
          qualifying meeting for six consecutive months is automatically disqualified unless the
          council grants a dispensation.
        </p>
      </Card>

      <Card>
        {(loading || permissionsLoading) ? (
          <p className="muted">Loading by-election risk alerts…</p>
        ) : error ? (
          <div className="status error" role="alert">{error}</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20, alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                Status
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="input input--sm"
                >
                  <option value="all">All statuses</option>
                  <option value="elevated">Elevated</option>
                  <option value="critical">Critical</option>
                  <option value="vacant">Vacant</option>
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                Region
                <select
                  value={filterRegion}
                  onChange={e => setFilterRegion(e.target.value)}
                  className="input input--sm"
                >
                  {regions.map(r => (
                    <option key={r} value={r}>{r === "all" ? "All regions" : r}</option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                Party
                <select
                  value={filterParty}
                  onChange={e => setFilterParty(e.target.value)}
                  className="input input--sm"
                >
                  {parties.map(p => (
                    <option key={p} value={p}>{p === "all" ? "All parties" : p}</option>
                  ))}
                </select>
              </label>
              {filtersActive && (
                <button
                  className="button ghost"
                  style={{ fontSize: 13 }}
                  onClick={() => { setFilterStatus("all"); setFilterRegion("all"); setFilterParty("all"); }}
                >
                  Clear filters
                </button>
              )}
              <span className="portal-data-note" style={{ marginLeft: "auto", marginBottom: 0 }}>
                {filtered.length} alert{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>

            {filtered.length === 0 ? (
              <div className="portal-placeholder-panel">
                {filtersActive
                  ? "No alerts match the current filters."
                  : isAdmin
                    ? "No active by-election risk alerts nationally."
                    : "No by-election risk alerts for your area."}
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th>Councillor</th>
                      <th>Ward</th>
                      <th>Council</th>
                      <th>Region</th>
                      <th>Party</th>
                      <th>Last attendance</th>
                      <th>Months elapsed</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(alert => (
                      <tr key={alert.id}>
                        <td>{alert.councillorName}</td>
                        <td>{alert.ward || "—"}</td>
                        <td>{alert.councilName || "—"}</td>
                        <td>{alert.region || "—"}</td>
                        <td>{alert.party || "—"}</td>
                        <td>{formatDate(alert.lastAttendanceDate)}</td>
                        <td style={{ textAlign: "center" }}>{alert.monthsElapsed ?? "—"}</td>
                        <td><StatusBadge status={alert.riskStatus} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
