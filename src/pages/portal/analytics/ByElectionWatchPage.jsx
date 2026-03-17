import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../../components/Card.jsx";
import { byElectionAlerts } from "../../../data/byElectionAlerts.js";
import { getByElectionWatchlist, getCouncilData } from "../constituency/constituencyApi.js";

// Criteria a seat can meet. Each is a boolean flag derived from data.
const CRITERIA = [
  { key: "narrowMajority",  label: "Majority < 5,000",          colour: "#dc2626" },
  { key: "firstTermMp",     label: "First/second-term MP",       colour: "#ea580c" },
  { key: "reformCouncil",   label: "Reform/NOC council",         colour: "#12B6CF" },
  { key: "hasAlert",        label: "Active political alert",     colour: "#7c3aed" },
];

function CriteriaBadge({ met, label, colour }) {
  if (!met) return null;
  return (
    <span
      className="status-pill"
      style={{ background: colour, color: "#ffffff", fontSize: 11, padding: "2px 8px" }}
    >
      {label}
    </span>
  );
}

function CriteriaCount({ count }) {
  const colour = count >= 3 ? "#b91c1c" : count === 2 ? "#ea580c" : "#64748b";
  return (
    <span style={{ fontWeight: 700, color: colour, fontSize: 13 }}>
      {count} {count === 1 ? "criterion" : "criteria"}
    </span>
  );
}

export default function ByElectionWatchPage() {
  const [seats, setSeats] = useState([]);
  const [councilMap, setCouncilMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const watchlist = await getByElectionWatchlist();
        if (cancelled) return;
        setSeats(watchlist);

        // Load council data for each constituency to check Reform/NOC territory
        const cids = watchlist.map((s) => s.constituency_id).filter(Boolean);
        const councilResults = await Promise.all(
          cids.map((cid) => getCouncilData(cid).catch(() => null))
        );
        if (cancelled) return;
        const nextCouncilMap = {};
        cids.forEach((cid, i) => {
          nextCouncilMap[cid] = councilResults[i];
        });
        setCouncilMap(nextCouncilMap);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load watchlist.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const enrichedSeats = useMemo(() => {
    return seats.map((seat) => {
      const con = seat.constituencies;
      const candidate = seat.candidates;

      // Criterion 1: majority < 5,000 — guaranteed by the API query
      const narrowMajority = true;

      // Criterion 2: first/second-term MP (first_elected_year >= 2019)
      // Requires candidates.first_elected_year to be populated
      const firstElectedYear = candidate?.first_elected_year ?? null;
      const firstTermMp = firstElectedYear != null ? firstElectedYear >= 2019 : null; // null = unknown

      // Criterion 3: Reform UK holds seats or council is NOC
      const council = councilMap[seat.constituency_id];
      let reformCouncil = false;
      if (council) {
        const comp = council.composition || {};
        const reformSeats = Number(comp["Reform UK"] || comp["Reform"] || 0);
        const isNoc = (council.control_type || "").toLowerCase().includes("no overall");
        reformCouncil = reformSeats > 0 || isNoc;
      }

      // Criterion 4: active political alert
      const matchingAlerts = byElectionAlerts.filter(
        (a) => a.constituencyName === con?.name || a.councilName != null
      );
      const hasAlert = matchingAlerts.length > 0;

      const criteriaMetCount = [
        narrowMajority,
        firstTermMp === true,
        reformCouncil,
        hasAlert,
      ].filter(Boolean).length;

      return {
        ...seat,
        constituency: con,
        candidate,
        narrowMajority,
        firstTermMp,
        reformCouncil,
        hasAlert,
        matchingAlerts,
        criteriaMetCount,
        majorityPct: seat.electorate ? ((seat.majority / seat.electorate) * 100).toFixed(1) : null,
      };
    }).sort((a, b) => b.criteriaMetCount - a.criteriaMetCount || a.majority - b.majority);
  }, [seats, councilMap]);

  if (loading) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Analytics Engine</span>
              <h1 className="portal-page-header__title">Loading By-Election Watch…</h1>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Analytics Engine</span>
              <h1 className="portal-page-header__title">By-Election Watch</h1>
            </div>
          </div>
          <div className="status error" role="alert">{error}</div>
        </Card>
      </div>
    );
  }

  const multiCriteria = enrichedSeats.filter((s) => s.criteriaMetCount >= 2);
  const incumbencyDataAvailable = seats.some((s) => s.candidates?.first_elected_year != null);

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Analytics Engine</span>
            <h1 className="portal-page-header__title">By-Election Watch</h1>
            <p className="portal-page-header__subtitle">
              Conservative seats under structured monitoring based on objective criteria. This is not
              a prediction of by-elections — it is a watchlist of seats where structural conditions
              warrant closer attention.
            </p>
          </div>
          <div className="portal-page-header__actions">
            <Link to="/portal/constituency" className="button ghost">All constituencies</Link>
          </div>
        </div>

        <div className="portal-summary-grid" style={{ marginTop: 24 }}>
          <div className="portal-stat">
            <span className="portal-stat__label">Seats monitored</span>
            <span className="portal-stat__value">{enrichedSeats.length}</span>
            <span className="portal-stat__meta">Conservative seats with majority under 5,000</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Multiple criteria</span>
            <span className="portal-stat__value">{multiCriteria.length}</span>
            <span className="portal-stat__meta">Meeting 2 or more watchlist criteria</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Smallest majority</span>
            <span className="portal-stat__value">
              {enrichedSeats.length > 0
                ? enrichedSeats[enrichedSeats.length - 1]?.majority?.toLocaleString("en-GB") ?? "—"
                : "—"}
            </span>
            <span className="portal-stat__meta">Votes</span>
          </div>
        </div>
      </Card>

      <Card title="Watchlist criteria">
        <div className="portal-data-note" style={{ marginTop: 0 }}>
          A seat appears on this watchlist if it meets the majority threshold below. Additional
          criteria are flagged where data is available. Seats meeting more criteria are listed first.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 16 }}>
          {CRITERIA.map((c) => (
            <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 12, height: 12, borderRadius: "50%", background: c.colour, flexShrink: 0 }} />
              <span style={{ fontSize: 13 }}>{c.label}</span>
            </div>
          ))}
        </div>
        {!incumbencyDataAvailable && (
          <div className="portal-data-note" style={{ marginTop: 12 }}>
            <strong>Incumbency data not yet loaded.</strong> The "First/second-term MP" criterion
            requires <code>candidates.first_elected_year</code> to be populated.
            Until then, this criterion shows as unknown for all seats.
          </div>
        )}
      </Card>

      {enrichedSeats.length === 0 ? (
        <Card>
          <div className="portal-placeholder-panel">
            <p className="portal-placeholder-panel__title">No seats meet the majority threshold</p>
            <p className="portal-placeholder-panel__body">
              No Conservative seats with a majority under 5,000 were found in the 2024 results.
            </p>
          </div>
        </Card>
      ) : (
        <Card title={`Monitored seats (${enrichedSeats.length})`}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Constituency</th>
                  <th>MP</th>
                  <th>Majority</th>
                  <th>Maj %</th>
                  <th>Criteria met</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {enrichedSeats.map((seat) => {
                  const mpName = seat.candidate
                    ? `${seat.candidate.first_name} ${seat.candidate.last_name}`
                    : "—";

                  return (
                    <tr key={seat.constituency_id}>
                      <td>
                        {seat.constituency ? (
                          <Link
                            className="table-link"
                            to={`/portal/constituency/${seat.constituency.ons_code}`}
                          >
                            {seat.constituency.name}
                          </Link>
                        ) : "—"}
                      </td>
                      <td>
                        <div className="portal-stack-compact">
                          <span style={{ fontSize: 13 }}>{mpName}</span>
                          {seat.firstTermMp === true && (
                            <span className="portal-current-status__meta">
                              First elected {seat.candidate?.first_elected_year}
                            </span>
                          )}
                          {seat.firstTermMp === null && (
                            <span className="portal-current-status__meta" style={{ color: "#9ca3af" }}>
                              Term unknown
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {seat.majority != null ? seat.majority.toLocaleString("en-GB") : "—"}
                      </td>
                      <td style={{ color: Number(seat.majorityPct) < 3 ? "#dc2626" : "#374151" }}>
                        {seat.majorityPct != null ? `${seat.majorityPct}%` : "—"}
                      </td>
                      <td>
                        <CriteriaCount count={seat.criteriaMetCount} />
                      </td>
                      <td>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          <CriteriaBadge met={seat.narrowMajority} label="Narrow majority" colour="#dc2626" />
                          <CriteriaBadge met={seat.firstTermMp === true} label="First/2nd term" colour="#ea580c" />
                          <CriteriaBadge met={seat.reformCouncil} label="Reform/NOC council" colour="#12B6CF" />
                          <CriteriaBadge met={seat.hasAlert} label="Active alert" colour="#7c3aed" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card title="Active political alerts">
        {byElectionAlerts.length === 0 ? (
          <p className="portal-current-status__meta">No active alerts recorded.</p>
        ) : (
          <div className="portal-stack-compact">
            {byElectionAlerts.map((alert, i) => (
              <div key={i} className="portal-record">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 13 }}>
                      {alert.constituencyName || alert.councilName || "General"}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: "#374151" }}>{alert.summary}</p>
                  </div>
                  <span
                    className="status-pill"
                    style={{
                      background: alert.riskLevel === "high" ? "#dc2626" : "#ea580c",
                      color: "#ffffff",
                      alignSelf: "flex-start",
                      flexShrink: 0,
                      fontSize: 11,
                    }}
                  >
                    {alert.riskLevel}
                  </span>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 11, color: "#9ca3af" }}>
                  Updated {alert.lastUpdated}
                </p>
              </div>
            ))}
          </div>
        )}
        <div className="portal-data-note" style={{ marginTop: 12 }}>
          Alerts are manually maintained in <code>src/data/byElectionAlerts.js</code>.
          Add entries for MP health issues, pending standards investigations, local party collapses,
          or other circumstances that could trigger a vacancy.
        </div>
      </Card>

      <Card title="About this watchlist">
        <div className="portal-data-note" style={{ marginTop: 0 }}>
          <strong>This is not a by-election prediction model.</strong> No statistical score is assigned.
          The watchlist surface seats where one or more observable structural conditions make a vacancy
          or contest materially plausible within a parliament. Inclusion does not imply a by-election
          is likely — it means the seat warrants monitoring. Seats are removed when their majority
          increases (at the next general election) or criteria no longer apply.
        </div>
      </Card>
    </div>
  );
}
