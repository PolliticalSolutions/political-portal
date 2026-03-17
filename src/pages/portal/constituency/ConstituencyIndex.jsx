import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import Card from "../../../components/Card.jsx";
import { getLatestElectionWinners } from "./constituencyApi.js";
import { buildSeatsByPartySummary, getCurrentStatus, normalizePartyName } from "./constituencyPresentation.js";

const ConstituencyMapClient = lazy(() => import("./ConstituencyMapClient.jsx"));

function toHexColor(hex) {
  if (!hex) return null;
  return hex.startsWith("#") ? hex : `#${hex}`;
}

function PartyDot({ hex, size = 10 }) {
  return (
    <span
      className="party-dot"
      style={{
        width: size,
        height: size,
        background: toHexColor(hex) ?? "#94a3b8",
      }}
    />
  );
}

function SeatBar({ label, shortName, hex, count, total }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="portal-kpi-row">
      <PartyDot hex={hex} />
      <span className="portal-kpi-label" title={label}>
        {shortName || label}
      </span>
      <div className="portal-kpi-bar">
        <div
          className="portal-kpi-bar__fill"
          style={{
            width: `${pct}%`,
            background: toHexColor(hex) ?? "#94a3b8",
          }}
        />
      </div>
      <span className="portal-kpi-value">{count}</span>
    </div>
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

export default function ConstituencyIndex() {
  const [allConstituencies, setAllConstituencies] = useState([]);
  const [regions, setRegions] = useState([]);
  const [countries, setCountries] = useState([]);
  const [latestElection, setLatestElection] = useState(null);
  const [winnerRows, setWinnerRows] = useState([]);
  const [winnersByOnsCode, setWinnersByOnsCode] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("");
  const [selectedCountry, setSelectedCountry] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const electionData = await getLatestElectionWinners();
        if (cancelled) return;

        const validOnsCode = /^[ESWN]\d/;
        const seenCodes = new Set();
        const constituencies = electionData.winners
          .map((winner) => winner.constituencies)
          .filter((constituency) => {
            if (!constituency) return false;
            const code = constituency.ons_code ?? "";
            if (!validOnsCode.test(code)) {
              console.warn("[ConstituencyIndex] Invalid ONS code — excluded:", {
                code,
                name: constituency.name,
              });
              return false;
            }
            if (seenCodes.has(code)) {
              console.warn("[ConstituencyIndex] Duplicate ONS code — excluded:", {
                code,
                name: constituency.name,
              });
              return false;
            }
            seenCodes.add(code);
            return true;
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        const nextRegions = [...new Set(constituencies.map((c) => c.region).filter(Boolean))].sort();
        const nextCountries = [...new Set(constituencies.map((c) => c.country).filter(Boolean))].sort();

        const winnerMap = {};
        electionData.winners.forEach((winner) => {
          const onsCode = winner.constituencies?.ons_code;
          const normalizedOnsCode = (onsCode || "").toUpperCase();
          if (normalizedOnsCode && validOnsCode.test(normalizedOnsCode) && !winnerMap[normalizedOnsCode]) {
            winnerMap[normalizedOnsCode] = winner.parties;
          }
        });

        setAllConstituencies(constituencies);
        setRegions(nextRegions);
        setCountries(nextCountries);
        setLatestElection({ name: electionData.electionName, date: electionData.electionDate });
        setWinnerRows(electionData.winners);
        setWinnersByOnsCode(winnerMap);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load constituency data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredConstituencies = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return allConstituencies.filter((constituency) => {
      if (normalizedQuery && !constituency.name.toLowerCase().includes(normalizedQuery)) return false;
      if (selectedRegion && constituency.region !== selectedRegion) return false;
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

  const hasFilters = Boolean(query || selectedRegion || selectedCountry);

  if (loading) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Constituency Intelligence</span>
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
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Constituency Intelligence</span>
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
          </div>
          <div className="portal-page-header__actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQuery("");
                setSelectedRegion("");
                setSelectedCountry("");
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
                  winnerColoursByOnsCode={Object.fromEntries(
                    Object.entries(winnersByOnsCode).map(([onsCode, party]) => [onsCode, toHexColor(party?.colour_hex)])
                  )}
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
              <div className="portal-stack-compact">
                {seatsByParty.map((party) => (
                  <SeatBar
                    key={party.name}
                    label={party.name}
                    shortName={party.shortName}
                    hex={party.hex}
                    count={party.count}
                    total={totalSeats}
                  />
                ))}
              </div>
            </Card>
          )}
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
                </tr>
              </thead>
              <tbody>
                {filteredConstituencies.map((constituency) => {
                  const winner = winnersByOnsCode[constituency.ons_code];
                  const currentStatus = currentStatusByOnsCode[constituency.ons_code] || null;
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
                              <PartyDot hex={winner.colour_hex} />
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
