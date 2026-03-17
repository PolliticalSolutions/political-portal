import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../../components/Card.jsx";
import { getLatestElectionWinners } from "./constituencyApi.js";

// Lazy-loaded so react-simple-maps (browser-only) is never in the SSR module graph.
// The double lazy chain (App → ConstituencyIndex → ConstituencyMapClient) ensures
// the map bundle is fully code-split from both the SSR entry and the main client bundle.
const ConstituencyMapClient = lazy(() => import("./ConstituencyMapClient.jsx"));

function toHexColor(hex) {
  if (!hex) return null;
  return hex.startsWith("#") ? hex : `#${hex}`;
}

function PartyDot({ hex, size = 10 }) {
  const color = toHexColor(hex);
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: color ?? "#94a3b8",
        flexShrink: 0,
      }}
    />
  );
}

function SeatBar({ label, shortName, hex, count, total }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
      <PartyDot hex={hex} />
      <span style={{ width: 120, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {shortName || label}
      </span>
      <div style={{ flex: 1, height: 10, background: "#e2e8f0", borderRadius: 4, overflow: "hidden" }}>
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: toHexColor(hex) ?? "#94a3b8",
            borderRadius: 4,
          }}
        />
      </div>
      <span style={{ fontSize: 12, color: "#64748b", width: 30, textAlign: "right" }}>{count}</span>
    </div>
  );
}

export default function ConstituencyIndex() {
  const [allConstituencies, setAllConstituencies] = useState([]);
  const [regions, setRegions] = useState([]);
  const [countries, setCountries] = useState([]);
  const [latestElection, setLatestElection] = useState(null);
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
        // A single query returns all 2024 winners with constituency + party data embedded.
        // No secondary large .in() query needed — avoids 400 Bad Request from URL length limits.
        const electionData = await getLatestElectionWinners();
        if (cancelled) return;

        // Extract the 650 2024 constituencies directly from the winners rows.
        // Filter to valid ONS codes (E/S/W/N + digits) and deduplicate by ons_code.
        // Log any invalid or duplicate entries so the rogue record can be identified.
        const validOnsCode = /^[ESWN]\d/;
        const seenCodes = new Set();
        const constituencies = electionData.winners
          .map((w) => w.constituencies)
          .filter((c) => {
            if (!c) return false;
            const code = c.ons_code ?? "";
            if (!validOnsCode.test(code)) {
              console.warn("[ConstituencyIndex] Invalid ONS code — excluded:", { code, name: c.name });
              return false;
            }
            if (seenCodes.has(code)) {
              console.warn("[ConstituencyIndex] Duplicate ONS code — excluded:", { code, name: c.name });
              return false;
            }
            seenCodes.add(code);
            return true;
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        // Derive regions and countries client-side — no extra query needed.
        const regions = [...new Set(constituencies.map((c) => c.region).filter(Boolean))].sort();
        const countries = [...new Set(constituencies.map((c) => c.country).filter(Boolean))].sort();

        // Build ons_code → party lookup for the map and list.
        // Only include valid, non-duplicate 2024 ONS codes.
        const onscodeMap = {};
        electionData.winners.forEach((w) => {
          const onsCode = w.constituencies?.ons_code;
          if (onsCode && validOnsCode.test(onsCode) && !onscodeMap[onsCode]) {
            onscodeMap[onsCode] = w.parties;
          }
        });

        setAllConstituencies(constituencies);
        setRegions(regions);
        setCountries(countries);
        setLatestElection({ name: electionData.electionName, date: electionData.electionDate });
        setWinnersByOnsCode(onscodeMap);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load constituency data.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const filteredConstituencies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allConstituencies.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q)) return false;
      if (selectedRegion && c.region !== selectedRegion) return false;
      if (selectedCountry && c.country !== selectedCountry) return false;
      return true;
    });
  }, [allConstituencies, query, selectedRegion, selectedCountry]);

  const seatsByParty = useMemo(() => {
    const acc = {};
    Object.values(winnersByOnsCode).forEach((party) => {
      if (!party) return;
      // Group by short_name so Labour and Labour Co-op don't appear as separate rows.
      const key = party.short_name || party.name;
      if (!acc[key]) {
        acc[key] = { name: party.name, shortName: party.short_name, hex: party.colour_hex, count: 0 };
      }
      acc[key].count += 1;
    });
    return Object.values(acc).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [winnersByOnsCode]);

  const totalSeats = useMemo(
    () => seatsByParty.reduce((sum, p) => sum + p.count, 0),
    [seatsByParty]
  );

  if (loading) {
    return (
      <div className="page stack">
        <Card title="Constituency Intelligence">
          <p className="muted">Loading...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="page stack">
      {error && (
        <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>
          {error}
        </p>
      )}

      {/* Search and filter controls */}
      <Card title="Constituency Intelligence">
        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 4,
          }}
        >
          <input
            type="search"
            placeholder="Search by constituency name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: "1 1 240px", minWidth: 0 }}
            aria-label="Search constituencies"
          />
          <select
            value={selectedRegion}
            onChange={(e) => setSelectedRegion(e.target.value)}
            aria-label="Filter by region"
            style={{ flex: "0 1 180px" }}
          >
            <option value="">All regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            aria-label="Filter by country"
            style={{ flex: "0 1 160px" }}
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {(query || selectedRegion || selectedCountry) && (
            <button
              type="button"
              className="button ghost"
              onClick={() => { setQuery(""); setSelectedRegion(""); setSelectedCountry(""); }}
            >
              Clear filters
            </button>
          )}
        </div>
        {(query || selectedRegion || selectedCountry) && (
          <p className="muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
            {filteredConstituencies.length} of {allConstituencies.length} constituencies
          </p>
        )}
      </Card>

      {/* Map + stats panel */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 280px",
          gap: 16,
          alignItems: "start",
        }}
      >
        <Card>
          <Suspense fallback={<div style={{ width: "100%", aspectRatio: "500 / 750", background: "#f8fafc", borderRadius: 8 }} />}>
            <ConstituencyMapClient winnersByOnsCode={winnersByOnsCode} />
          </Suspense>
        </Card>

        <div className="stack" style={{ gap: 12 }}>
          <Card title="Overview">
            <div className="stack" style={{ gap: 6, fontSize: 14 }}>
              <div>
                <span className="muted">Total constituencies</span>
                <div style={{ fontWeight: 700, fontSize: 22 }}>{allConstituencies.length}</div>
              </div>
              {latestElection?.name && (
                <div>
                  <span className="muted">Latest election</span>
                  <div style={{ fontWeight: 600 }}>{latestElection.name}</div>
                  {latestElection.date && (
                    <div style={{ fontSize: 12, color: "#64748b" }}>
                      {new Date(latestElection.date).toLocaleDateString("en-GB", {
                        day: "numeric", month: "long", year: "numeric",
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {seatsByParty.length > 0 && (
            <Card title="Seats won">
              <div style={{ marginTop: 8 }}>
                {seatsByParty.map((p) => (
                  <SeatBar
                    key={p.name}
                    label={p.name}
                    shortName={p.shortName}
                    hex={p.hex}
                    count={p.count}
                    total={totalSeats}
                  />
                ))}
                {Object.keys(winnersByOnsCode).length > totalSeats && (
                  <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    Others not shown
                  </p>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Constituency list */}
      <Card
        title={
          query || selectedRegion || selectedCountry
            ? `Results (${filteredConstituencies.length})`
            : `All constituencies (${allConstituencies.length})`
        }
      >
        {filteredConstituencies.length === 0 ? (
          <p className="muted">No constituencies match your filters.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Constituency</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Region</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Country</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Type</th>
                  <th style={{ padding: "6px 8px", fontWeight: 600 }}>Latest winner</th>
                </tr>
              </thead>
              <tbody>
                {filteredConstituencies.map((c) => {
                  const winner = winnersByOnsCode[c.ons_code];
                  return (
                    <tr
                      key={c.ons_code}
                      style={{ borderBottom: "1px solid #f1f5f9" }}
                    >
                      <td style={{ padding: "6px 8px" }}>
                        <Link
                          to={`/portal/constituency/${c.ons_code}`}
                          style={{ fontWeight: 600, textDecoration: "none", color: "inherit" }}
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td style={{ padding: "6px 8px", color: "#64748b" }}>{c.region || "—"}</td>
                      <td style={{ padding: "6px 8px", color: "#64748b" }}>{c.country || "—"}</td>
                      <td style={{ padding: "6px 8px", color: "#64748b", fontSize: 12 }}>
                        {c.constituency_type || "—"}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        {winner ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <PartyDot hex={winner.colour_hex} />
                            <span>{winner.short_name || winner.name}</span>
                          </span>
                        ) : (
                          <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>
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
