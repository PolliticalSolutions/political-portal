import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Card from "../../../components/Card.jsx";
import Button from "../../../components/Button.jsx";
import { projectNationalScenario } from "../../../lib/scenarioModeller.js";
import { getLatestElectionScenarioBaseline } from "../constituency/constituencyApi.js";

const DEFAULT_SWING = {
  conservative: -5,
  labour: 3,
  reform: 4,
};

function formatSigned(value) {
  const numeric = Number(value || 0);
  if (numeric === 0) return "0.0";
  return `${numeric > 0 ? "+" : ""}${numeric.toFixed(1)}`;
}

export default function ScenarioPage() {
  const [baseline, setBaseline] = useState({ electionName: null, electionDate: null, rows: [] });
  const [form, setForm] = useState(DEFAULT_SWING);
  const [submittedSwing, setSubmittedSwing] = useState(DEFAULT_SWING);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const result = await getLatestElectionScenarioBaseline();
        if (!cancelled) {
          setBaseline(result);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err.message || "Failed to load scenario baseline.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const scenario = useMemo(
    () => projectNationalScenario(baseline.rows, submittedSwing),
    [baseline.rows, submittedSwing]
  );

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmittedSwing({
      conservative: Number(form.conservative || 0),
      labour: Number(form.labour || 0),
      reform: Number(form.reform || 0),
    });
  };

  if (loading) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Analytics Engine</span>
              <h1 className="portal-page-header__title">Loading national scenario modeller…</h1>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (error || baseline.rows.length === 0) {
    return (
      <div className="page stack">
        <Card>
          <div className="portal-page-header">
            <div className="portal-page-header__content">
              <span className="portal-page-header__eyebrow">Analytics Engine</span>
              <h1 className="portal-page-header__title">National Scenario Modeller</h1>
            </div>
          </div>
          {error && <div className="status error" role="alert">{error}</div>}
          {!error && (
            <div className="portal-placeholder-panel">
              <p className="portal-placeholder-panel__title">No latest election baseline available</p>
              <p className="portal-placeholder-panel__body">
                The scenario modeller needs latest general-election result rows before it can project seat changes.
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
            <h1 className="portal-page-header__title">National Scenario Modeller</h1>
            <p className="portal-page-header__subtitle">
              Apply a simple uniform swing to the latest general-election baseline and see which seats
              change hands. This is a planning tool for fast scenario testing, not a constituency-level
              forecast model.
            </p>
          </div>
          <div className="portal-page-header__actions">
            <Link to="/portal/analytics/model-performance" className="button ghost">
              Model validation
            </Link>
          </div>
        </div>

        <div className="portal-data-note" style={{ marginTop: 20 }}>
          Baseline: <strong>{baseline.electionName || "Latest general election"}</strong>
          {baseline.electionDate ? ` (${baseline.electionDate})` : ""}. Only Conservative, Labour,
          and Reform swing inputs are adjusted directly; all other parties are held constant and the
          seat-level shares are renormalised.
        </div>
      </Card>

      <Card title="Uniform swing inputs">
        <form className="scenario-form-grid" onSubmit={handleSubmit}>
          <label className="scenario-field">
            <span>Conservative swing</span>
            <input
              className="input"
              type="number"
              step="0.1"
              value={form.conservative}
              onChange={(event) => setForm((current) => ({ ...current, conservative: event.target.value }))}
            />
          </label>
          <label className="scenario-field">
            <span>Labour swing</span>
            <input
              className="input"
              type="number"
              step="0.1"
              value={form.labour}
              onChange={(event) => setForm((current) => ({ ...current, labour: event.target.value }))}
            />
          </label>
          <label className="scenario-field">
            <span>Reform swing</span>
            <input
              className="input"
              type="number"
              step="0.1"
              value={form.reform}
              onChange={(event) => setForm((current) => ({ ...current, reform: event.target.value }))}
            />
          </label>
          <div className="scenario-actions">
            <Button type="submit">Apply scenario</Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="portal-summary-grid">
          <div className="portal-stat">
            <span className="portal-stat__label">Seats modelled</span>
            <span className="portal-stat__value">{scenario.summary.totalSeats}</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Changed hands</span>
            <span className="portal-stat__value">{scenario.summary.changedHands}</span>
            <span className="portal-stat__meta">Projected seat changes under this uniform swing</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Projected Conservative seats</span>
            <span className="portal-stat__value">{scenario.summary.conservativeProjected}</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Projected Labour seats</span>
            <span className="portal-stat__value">{scenario.summary.labourProjected}</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Projected Reform seats</span>
            <span className="portal-stat__value">{scenario.summary.reformProjected}</span>
          </div>
          <div className="portal-stat">
            <span className="portal-stat__label">Input summary</span>
            <span className="portal-stat__value">Con {formatSigned(submittedSwing.conservative)}</span>
            <span className="portal-stat__meta">
              Lab {formatSigned(submittedSwing.labour)} | Reform {formatSigned(submittedSwing.reform)}
            </span>
          </div>
        </div>
      </Card>

      <Card title="Projected seat totals">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Party</th>
                <th>Projected seats</th>
              </tr>
            </thead>
            <tbody>
              {scenario.projectedSeatTotals.map((row) => (
                <tr key={row.party}>
                  <td>{row.party}</td>
                  <td>{row.seats}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={`Seats changing hands (${scenario.changedSeats.length})`}>
        {scenario.changedSeats.length === 0 ? (
          <div className="portal-placeholder-panel">
            <p className="portal-placeholder-panel__title">No seat changes under this scenario</p>
            <p className="portal-placeholder-panel__body">
              Try a larger uniform swing if you want to stress-test the national picture.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Constituency</th>
                  <th>Current winner</th>
                  <th>Projected winner</th>
                  <th>Projected top line</th>
                  <th>Projected majority</th>
                </tr>
              </thead>
              <tbody>
                {scenario.changedSeats.map((seat) => (
                  <tr key={seat.constituencyId}>
                    <td>
                      <Link className="table-link" to={`/portal/constituency/${seat.onsCode}`}>
                        {seat.constituencyName}
                      </Link>
                    </td>
                    <td>{seat.baselineWinner}</td>
                    <td>{seat.projectedWinner}</td>
                    <td>
                      {seat.topTwo[0]?.partyName} {seat.topTwo[0]?.adjustedShare ?? "—"}% /{" "}
                      {seat.topTwo[1]?.partyName || "—"} {seat.topTwo[1]?.adjustedShare ?? "—"}%
                    </td>
                    <td>{seat.projectedMajority.toFixed(1)} pts</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
