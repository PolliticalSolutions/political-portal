import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../../components/Card.jsx";
import DataProvenancePanel from "../../../components/DataProvenancePanel.jsx";
import { getIntelligenceMetadata } from "../../../lib/intelligenceMetadataApi.js";
import { getNationalCorrelations, getRegionalCorrelations } from "../constituency/constituencyApi.js";
import { resolvePartyColour } from "../../../utils/partyColours.js";

const REGION_ORDER = [
  "North East",
  "North West",
  "Yorkshire and The Humber",
  "East Midlands",
  "West Midlands",
  "East of England",
  "London",
  "South East",
  "South West",
  "Scotland",
  "Wales",
];

const VARIABLE_LABELS = {
  pct_owner_occupied: "Owner-occupancy",
  pct_degree_qualified: "Degree qualification",
  pct_no_qualifications: "No formal qualifications",
  pct_white_british: "White British population",
  pct_social_rented: "Social rent",
  pct_private_rented: "Private rent",
  pct_christian: "Christian identity",
  pct_employed: "Employment",
  median_household_income: "Median household income",
};

function formatCorrelation(value) {
  return `${value >= 0 ? "+" : ""}${Number(value).toFixed(2)}`;
}

function describeCorrelation(row) {
  const direction = Number(row.correlation_coefficient) >= 0 ? "predicts stronger" : "predicts weaker";
  const variableLabel = VARIABLE_LABELS[row.demographic_variable] || row.demographic_variable;
  const partyName = row.parties?.name || row.parties?.short_name || "party performance";
  return `${variableLabel} ${direction} ${partyName} support`;
}

function InsightChip({ row }) {
  return (
    <div className="portal-record">
      <div className="portal-record__header">
        <div>
          <p className="portal-record__title">{describeCorrelation(row)}</p>
          <p className="portal-record__meta">
            Sample size {row.sample_size} · {VARIABLE_LABELS[row.demographic_variable] || row.demographic_variable}
          </p>
        </div>
        <span
          className="status-pill"
          style={{
            background: resolvePartyColour(row.parties),
            color: Number(row.correlation_coefficient) > 0.55 ? "#ffffff" : "#1f2937",
          }}
        >
          r = {formatCorrelation(row.correlation_coefficient)}
        </span>
      </div>
    </div>
  );
}

function RegionalSection({ region, rows }) {
  return (
    <Card title={region}>
      <div className="portal-stack-compact">
        {rows.slice(0, 3).map((row) => (
          <InsightChip key={`${region}-${row.demographic_variable}-${row.parties?.id || row.parties?.name}`} row={row} />
        ))}
      </div>
      <div className="table-wrap" style={{ marginTop: 16 }}>
        <table className="table table--compact">
          <thead>
            <tr>
              <th>Variable</th>
              <th>Party</th>
              <th>Correlation</th>
              <th>Sample</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 6).map((row) => (
              <tr key={`${region}-${row.demographic_variable}-${row.parties?.id || row.parties?.name}`}>
                <td>{VARIABLE_LABELS[row.demographic_variable] || row.demographic_variable}</td>
                <td>
                  <span className="party-chip">
                    <span
                      className="party-dot"
                      style={{ width: 10, height: 10, background: resolvePartyColour(row.parties) }}
                    />
                    <span>{row.parties?.short_name || row.parties?.name || "—"}</span>
                  </span>
                </td>
                <td>
                  <span className={Number(row.correlation_coefficient) >= 0 ? "portal-change portal-change--positive" : "portal-change portal-change--negative"}>
                    {formatCorrelation(row.correlation_coefficient)}
                  </span>
                </td>
                <td>{row.sample_size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function CorrelationsPage() {
  const [nationalRows, setNationalRows] = useState([]);
  const [regionalRows, setRegionalRows] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const national = await getNationalCorrelations();
        if (cancelled) return;
        setNationalRows(national);

        const regionEntries = await Promise.all(
          REGION_ORDER.map(async (region) => [region, await getRegionalCorrelations(region)])
        );
        if (cancelled) return;

        setRegionalRows(
          Object.fromEntries(regionEntries.filter(([, rows]) => Array.isArray(rows) && rows.length > 0))
        );
        const nextMetadata = await getIntelligenceMetadata({
          datasetKey: "demographic_correlations",
        });
        if (!cancelled) setMetadata(nextMetadata);
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load demographic correlations.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const topNationalInsights = useMemo(() => {
    return [...nationalRows]
      .sort((a, b) => Math.abs(Number(b.correlation_coefficient)) - Math.abs(Number(a.correlation_coefficient)))
      .slice(0, 4);
  }, [nationalRows]);

  if (loading) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Analytics Engine</span>
              <h1 className="portal-page-header__title">Loading national correlations…</h1>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (error || nationalRows.length === 0) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Analytics Engine</span>
              <h1 className="portal-page-header__title">National Correlations</h1>
              <p className="portal-page-header__subtitle">
                Read demographic relationships with party vote share as an intelligence briefing, not a raw data dump.
              </p>
            </div>
            <div className="portal-page-header__actions">
              <Link to="/portal/constituency" className="button ghost">
                Constituencies
              </Link>
            </div>
          </div>
          {error && <div className="status error" role="alert">{error}</div>}
          {!error && (
            <div className="portal-placeholder-panel">
              <p className="portal-placeholder-panel__title">No demographic correlations yet</p>
              <p className="portal-placeholder-panel__body">
                Run <code>python scripts/calculate_correlations.py</code> after creating the{" "}
                <code>demographic_correlations</code> table in Supabase.
              </p>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Analytics Engine</span>
            <h1 className="portal-page-header__title">National Correlations</h1>
            <p className="portal-page-header__subtitle">
              The strongest demographic relationships with party vote share, presented as an intelligence briefing
              for national strategy, seat targeting, and message planning.
            </p>
          </div>
          <div className="portal-page-header__actions">
            <Link to="/portal/constituency" className="button ghost">
              Constituencies
            </Link>
          </div>
        </div>

        <div className="portal-summary-grid" style={{ marginTop: 24 }}>
          <div className="portal-stat">
            <span className="portal-stat__label">National signals</span>
            <span className="portal-stat__value">{nationalRows.length}</span>
            <span className="portal-stat__meta">Significant correlations retained</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Regions covered</span>
            <span className="portal-stat__value">{Object.keys(regionalRows).length}</span>
            <span className="portal-stat__meta">Regional correlation slices loaded</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Strongest national coefficient</span>
            <span className="portal-stat__value">
              {formatCorrelation(topNationalInsights[0]?.correlation_coefficient || 0)}
            </span>
            <span className="portal-stat__meta">{describeCorrelation(topNationalInsights[0] || {})}</span>
          </div>
        </div>
      </Card>

      <DataProvenancePanel
        metadata={metadata}
        fallbackCopy="Correlation-source references and review metadata will appear here when the demographic correlation dataset is linked in the provenance layer."
      />

      <Card title="National briefing">
        <div className="portal-stack-compact">
          {topNationalInsights.map((row) => (
            <InsightChip key={`national-${row.demographic_variable}-${row.parties?.id || row.parties?.name}`} row={row} />
          ))}
        </div>
      </Card>

      <div className="portal-insight-callout">
        <p className="portal-insight-callout__title">How to use this view</p>
        <p className="portal-insight-callout__body">
          Use the national summary to understand broad structural relationships, then read the regional sections
          for exceptions and local variation. These are correlation signals, not causal claims, so they should
          guide targeting and message testing rather than replace seat-level judgement.
        </p>
      </div>

      <div className="card-grid">
        {Object.entries(regionalRows).map(([region, rows]) => (
          <RegionalSection key={region} region={region} rows={rows} />
        ))}
      </div>
    </div>
  );
}
