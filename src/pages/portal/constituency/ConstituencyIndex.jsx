import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import Button from "../../../components/Button.jsx";
import Card from "../../../components/Card.jsx";
import { byElectionAlerts } from "../../../data/byElectionAlerts.js";
import { getLatestElectionWinners, getAllMarginalityScores, getHighRiskByElectionSeats } from "./constituencyApi.js";
import {
  buildSeatsByPartySummary,
  CURRENT_COMPOSITION,
  getCurrentStatus,
  normalizePartyName,
} from "./constituencyPresentation.js";
import { resolvePartyColour, toHexColor } from "../../../utils/partyColours.js";

const ConstituencyMapClient = lazy(() => import("./ConstituencyMapClient.jsx"));

function PartyDot({ hex, party, size = 10 }) {
  return (
    <span
      className="party-dot"
      style={{
        width: size,
        height: size,
        background: resolvePartyColour(
          party ?? { colour_hex: hex },
          toHexColor(hex) ?? "#94a3b8"
        ),
      }}
    />
  );
}

function formatSignedChange(value) {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "0";
  return `${value > 0 ? "+" : ""}${value}`;
}

function changeClassName(value) {
  if (value > 0) return "portal-change portal-change--positive";
  if (value < 0) return "portal-change portal-change--negative";
  return "portal-change";
}

function SeatsWonRow({ label, shortName, hex, count, total, change }) {
  const pct = total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
  return (
    <tr>
      <td>
        <span className="party-chip">
          <PartyDot hex={hex} />
          <span title={label}>{shortName || label}</span>
        </span>
      </td>
      <td>{count}</td>
      <td>{pct}%</td>
      <td>
        <span className={changeClassName(change)}>{formatSignedChange(change)}</span>
      </td>
    </tr>
  );
}

function formatDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const ALERT_TYPE_LABELS = {
  council_instability: "Council instability",
  by_election_risk: "By-election risk",
  leadership_change: "Leadership change",
};

function AlertsFeed({ alerts }) {
  const active = alerts.filter((a) => a.riskLevel === "high" || a.riskLevel === "medium");
  if (active.length === 0) return null;

  return (
    <div className="alerts-feed">
      <div className="alerts-feed__header">
        <span className="alerts-feed__title">INTELLIGENCE ALERTS</span>
        <span className="alerts-feed__count">{active.length} active</span>
      </div>
      <div className="alerts-feed__list">
        {active.map((alert, i) => (
          <div
            key={i}
            className={`alerts-feed__item${i === active.length - 1 ? " alerts-feed__item--last" : ""}`}
          >
            <div className="alerts-feed__meta">
              <span className="alerts-feed__type">
                {ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType}
              </span>
              <span className={`alerts-feed__risk alerts-feed__risk--${alert.riskLevel}`}>
                {alert.riskLevel} risk
              </span>
              {alert.councilName && (
                <span className="alerts-feed__source">{alert.councilName}</span>
              )}
              {alert.constituencyName && (
                <span className="alerts-feed__source">{alert.constituencyName}</span>
              )}
            </div>
            <p className="alerts-feed__summary">{alert.summary}</p>
            <p className="alerts-feed__updated">Updated {formatDate(alert.lastUpdated)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ConstituencyIndex() {
  const [query, setQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [selectedMarginality, setSelectedMarginality] = useState("");

  // All three queries fire in parallel. latestElectionWinners is shared with ReformThreatIndex cache.
  const { data: electionData, isLoading: electionLoading, isError: electionError } = useQuery({
    queryKey: ["latestElectionWinners"],
    queryFn: getLatestElectionWinners,
  });

  const { data: marginalityRows = [] } = useQuery({
    queryKey: ["marginalityScores"],
    queryFn: getAllMarginalityScores,
  });

  const { data: highRiskSeats = [] } = useQuery({
    queryKey: ["highRiskByElectionSeats"],
    queryFn: getHighRiskByElectionSeats,
  });

  const loading = electionLoading;
  const error = electionError ? "Failed to load constituency data." : "";

  const validOnsCode = /^[ESWN]\d/;

  const allConstituencies = useMemo(() => {
    const winners = electionData?.winners ?? [];
    const seenCodes = new Set();
    return winners
      .map((winner) => winner.constituencies)
      .filter((constituency) => {
        if (!constituency) return false;
        const code = constituency.ons_code ?? "";
        if (!validOnsCode.test(code)) return false;
        if (seenCodes.has(code)) return false;
        seenCodes.add(code);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [electionData]);

  const winnerRows = useMemo(() => electionData?.winners ?? [], [electionData]);

  const winnersByOnsCode = useMemo(() => {
    const map = {};
    (electionData?.winners ?? []).forEach((winner) => {
      const onsCode = winner.constituencies?.ons_code;
      const normalizedOnsCode = (onsCode || "").toUpperCase();
      if (normalizedOnsCode && validOnsCode.test(normalizedOnsCode) && !map[normalizedOnsCode]) {
        map[normalizedOnsCode] = winner.parties;
      }
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [electionData]);

  const latestElection = useMemo(() => (
    electionData ? { name: electionData.electionName, date: electionData.electionDate } : null
  ), [electionData]);

  const regions = useMemo(() => [...new Set(allConstituencies.map((c) => c.region).filter(Boolean))].sort(), [allConstituencies]);
  const countries = useMemo(() => [...new Set(allConstituencies.map((c) => c.country).filter(Boolean))].sort(), [allConstituencies]);

  const marginalityByConId = useMemo(() => {
    const map = {};
    marginalityRows.forEach((s) => { map[s.constituency_id] = s; });
    return map;
  }, [marginalityRows]);

  const filteredConstituencies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allConstituencies.filter((constituency) => {
      if (normalizedQuery && !constituency.name.toLowerCase().includes(normalizedQuery)) return false;
      if (selectedRegion && constituency.region !== selectedRegion) return false;
      if (selectedMarginality) {
        const ms = marginalityByConId[constituency.id];
        if (!ms || ms.classification !== selectedMarginality) return false;
      }
      if (selectedCountry && constituency.country !== selectedCountry) return false;
      return true;
    });
  }, [allConstituencies, query, selectedRegion, selectedCountry]);

  const seatsByParty = useMemo(() => {
    return buildSeatsByPartySummary(winnerRows);
  }, [winnerRows]);

  const totalSeats = useMemo(
    () => seatsByParty.reduce((sum, party) => sum + party.count, 0),
    [seatsByParty]
  );

  const currentStatusByOnsCode = useMemo(() => {
    const statusMap = {};
    allConstituencies.forEach((constituency) => {
      const winner = winnersByOnsCode[constituency.ons_code];
      const currentStatus = getCurrentStatus(constituency.name, winner?.name || winner?.short_name || "");
      if (currentStatus?.differsFromElected) {
        statusMap[constituency.ons_code] = currentStatus;
      }
    });
    return statusMap;
  }, [allConstituencies, winnersByOnsCode]);

  const hasFilters = Boolean(query || selectedRegion || selectedCountry || selectedMarginality);

  if (loading) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <h1 className="portal-page-header__title">Constituency Intelligence</h1>
              <p className="portal-page-header__subtitle">Loading constituency data.</p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page stack">
      <Helmet><title>Constituency Intelligence | Political Solutions</title></Helmet>
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <h1 className="portal-page-header__title">UK constituency intelligence</h1>
            <p className="portal-page-header__subtitle">
              Review winners, election context, and constituency reference data in one search-led workspace.
            </p>
          </div>
        </div>
      </Card>

      {error && (
        <div className="status error" role="alert">
          {error}
        </div>
      )}

      <AlertsFeed alerts={byElectionAlerts} />

      <Card title="Search and filter">
        <div className="portal-filter-bar">
          <div className="portal-filter-grid">
            <label className="field field--span-2" htmlFor="constituency-search">
              <span>Search constituencies</span>
              <input
                id="constituency-search"
                className="input"
                type="search"
                placeholder="Search by constituency name"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <label className="field" htmlFor="constituency-region">
              <span>Region</span>
              <select
                id="constituency-region"
                className="input"
                value={selectedRegion}
                onChange={(event) => setSelectedRegion(event.target.value)}
              >
                <option value="">All regions</option>
                {regions.map((region) => (
                  <option key={region} value={region}>
                    {region}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="constituency-country">
              <span>Country</span>
              <select
                id="constituency-country"
                className="input"
                value={selectedCountry}
                onChange={(event) => setSelectedCountry(event.target.value)}
              >
                <option value="">All countries</option>
                {countries.map((country) => (
                  <option key={country} value={country}>
                    {country}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" htmlFor="constituency-marginality">
              <span>Marginality</span>
              <select
                id="constituency-marginality"
                className="input"
                value={selectedMarginality}
                onChange={(event) => setSelectedMarginality(event.target.value)}
              >
                <option value="">All seats</option>
                <option value="Ultra Marginal">Ultra Marginal</option>
                <option value="Highly Marginal">Highly Marginal</option>
                <option value="Marginal">Marginal</option>
                <option value="Likely">Likely</option>
                <option value="Safe">Safe</option>
              </select>
            </label>
          </div>
          <div className="portal-page-header__actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQuery("");
                setSelectedRegion("");
                setSelectedCountry("");
                setSelectedMarginality("");
              }}
              disabled={!hasFilters}
            >
              Clear filters
            </Button>
          </div>
          <p className="portal-kpi-note">
            Showing {filteredConstituencies.length} of {allConstituencies.length} constituencies.
          </p>
        </div>
      </Card>

      <div className="portal-split-grid">
        <Card title="Constituency map">
          <div className="portal-map-shell">
            <div className="portal-map-frame">
              <Suspense fallback={<div className="portal-map-fallback" />}>
                <ConstituencyMapClient
                  winnersByOnsCode={winnersByOnsCode}
                  currentStatusByOnsCode={currentStatusByOnsCode}
                />
              </Suspense>
            </div>
            {latestElection?.name && (
              <div className="portal-data-note">
                Latest national result loaded: <strong>{latestElection.name}</strong>
                {latestElection.date ? ` (${formatDate(latestElection.date)})` : ""}.
              </div>
            )}
          </div>
        </Card>

        <div className="portal-kpi-list">
          <Card title="Overview">
            <div className="portal-summary-grid">
              <div className="portal-stat">
                <span className="portal-stat__label">Constituencies</span>
                <span className="portal-stat__value">{allConstituencies.length}</span>
                <span className="portal-stat__meta">Search the full national seat list.</span>
              </div>
              <div className="portal-stat">
                <span className="portal-stat__label">Latest election</span>
                <span className="portal-stat__value">
                  {latestElection?.date ? new Date(latestElection.date).getFullYear() : "—"}
                </span>
                <span className="portal-stat__meta">{latestElection?.name || "No election summary loaded."}</span>
              </div>
            </div>
          </Card>

          {seatsByParty.length > 0 && (
            <Card title="Seats won">
              <div className="table-wrap">
                <table className="table table--compact">
                  <thead>
                    <tr>
                      <th>Party</th>
                      <th>Seats</th>
                      <th>Share</th>
                      <th>Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seatsByParty.map((party) => (
                      <SeatsWonRow
                        key={party.name}
                        label={party.name}
                        shortName={party.shortName}
                        hex={party.hex}
                        count={party.count}
                        total={totalSeats}
                        change={party.change}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card title="Current composition">
            <div className="table-wrap">
              <table className="table table--compact">
                <thead>
                  <tr>
                    <th>Party</th>
                    <th>Seats at GE2024</th>
                    <th>Current seats</th>
                    <th>Change</th>
                  </tr>
                </thead>
                <tbody>
                  {CURRENT_COMPOSITION.map((row) => (
                    <tr key={row.party}>
                      <td>{row.party}</td>
                      <td>{row.electedSeats}</td>
                      <td>{row.currentSeats}</td>
                      <td>
                        <span className={changeClassName(row.change)}>{formatSignedChange(row.change)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      <Card
        title={
          hasFilters
            ? `Filtered constituencies (${filteredConstituencies.length})`
            : `All constituencies (${allConstituencies.length})`
        }
      >
        {filteredConstituencies.length === 0 ? (
          <div className="portal-placeholder-panel">
            <p className="portal-placeholder-panel__title">No constituencies match these filters</p>
            <p className="portal-placeholder-panel__body">
              Change the search term or clear the current filters to see more constituencies.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Constituency</th>
                  <th>Region</th>
                  <th>Country</th>
                  <th>Type</th>
                  <th>Latest winner</th>
                  <th>Marginality</th>
                </tr>
              </thead>
              <tbody>
                {filteredConstituencies.map((constituency) => {
                  const winner = winnersByOnsCode[constituency.ons_code];
                  const currentStatus = currentStatusByOnsCode[constituency.ons_code] || null;
                  const marginality = marginalityByConId[constituency.id] ?? null;
                  const hasCurrentDifference =
                    currentStatus &&
                    normalizePartyName(currentStatus.currentPartyName) !==
                      normalizePartyName(winner?.name || winner?.short_name || "");
                  return (
                    <tr key={constituency.ons_code}>
                      <td>
                        <Link className="table-link" to={`/portal/constituency/${constituency.ons_code}`}>
                          {constituency.name}
                        </Link>
                      </td>
                      <td>{constituency.region || "—"}</td>
                      <td>{constituency.country || "—"}</td>
                      <td>{constituency.constituency_type || "—"}</td>
                      <td>
                        {winner ? (
                          <div className="portal-stack-compact">
                            <span className="party-chip">
                              <PartyDot hex={winner.colour_hex} party={winner} />
                              <span>{winner.short_name || winner.name}</span>
                            </span>
                            {hasCurrentDifference && (
                              <div className="portal-current-status">
                                <span className="status-pill warning">Current holder differs</span>
                                <span className="portal-current-status__meta">
                                  Current: {currentStatus.currentPartyShortName || currentStatus.currentPartyName}
                                </span>
                              </div>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {marginality ? (
                          <span style={{ fontSize: 12, fontWeight: 600, color:
                            marginality.classification === "Ultra Marginal" ? "#dc2626" :
                            marginality.classification === "Highly Marginal" ? "#ea580c" :
                            marginality.classification === "Marginal" ? "#d97706" :
                            marginality.classification === "Likely" ? "#1d4ed8" :
                            "#15803d"
                          }}>
                            {marginality.classification}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
