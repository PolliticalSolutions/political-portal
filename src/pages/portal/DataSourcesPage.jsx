import { Link } from "react-router-dom";
import Card from "../../components/Card.jsx";

const DATA_SOURCES = [
  {
    name: "UK Parliamentary Election Results",
    provider: "Electoral Commission / House of Commons Library",
    coverage: "All UK general elections 2010–2024; notional 2019 results on 2024 boundaries",
    lastUpdated: "July 2024 (2024 GE)",
    reliability: "High",
    limitations: "2019 notional results are estimates derived by apportioning 2019 votes to 2024 boundaries; not official counts.",
    link: "https://www.electoralcommission.org.uk/",
  },
  {
    name: "Census Demographics (2021)",
    provider: "Office for National Statistics (ONS)",
    coverage: "England and Wales, 2021 census output areas aggregated to Westminster constituencies",
    lastUpdated: "March 2023 (ONS release)",
    reliability: "High",
    limitations: "Scotland uses 2022 census (different release cycle). NI uses 2021 census. Constituency aggregation introduces small rounding error.",
    link: "https://www.ons.gov.uk/census",
  },
  {
    name: "Constituency Boundaries (PCON 2024)",
    provider: "ONS / Boundary Commissions",
    coverage: "All 650 UK constituencies, effective from 2024 general election",
    lastUpdated: "November 2023 (final orders)",
    reliability: "High",
    limitations: "Notional historical results on 2024 boundaries are estimates only.",
    link: "https://geoportal.statistics.gov.uk/",
  },
  {
    name: "Local Government Election Results",
    provider: "Electoral Commission / Local authority returns",
    coverage: "English, Welsh, and Scottish council elections; patchy for Northern Ireland",
    lastUpdated: "May 2024 (latest cycle)",
    reliability: "Medium",
    limitations: "Data completeness varies by council. By-election results between scheduled cycles may lag several months.",
    link: "https://www.electoralcommission.org.uk/",
  },
  {
    name: "Local Government Reorganisation (LGR) Status",
    provider: "Ministry of Housing, Communities and Local Government (MHCLG)",
    coverage: "English two-tier areas undergoing reorganisation; 19 areas tracked",
    lastUpdated: "March 2026 (Surrey order; Wave 2 consultation)",
    reliability: "Medium",
    limitations: "LGR status changes rapidly as ministerial decisions are made. Proposed unitary names and abolition dates are subject to revision. Scotland and Wales have separate reorganisation processes not tracked here.",
    link: "https://www.gov.uk/government/collections/local-government-reorganisation",
  },
  {
    name: "Brexit Referendum Results (Leave vote share)",
    provider: "Electoral Commission",
    coverage: "All UK local counting areas, apportioned to Westminster constituencies by Electoral Calculus",
    lastUpdated: "June 2016 (referendum)",
    reliability: "Medium",
    limitations: "Constituency-level Leave figures are estimates; the referendum used different counting units. Used as a structural variable only.",
    link: "https://www.electoralcommission.org.uk/",
  },
  {
    name: "Electorate Figures",
    provider: "Electoral Commission / individual Returning Officers",
    coverage: "All UK constituencies, updated at each general election and periodic register updates",
    lastUpdated: "July 2024 (2024 GE registers)",
    reliability: "High",
    limitations: "Mid-cycle electorate figures are estimates only. Historical electorate data on 2024 boundaries is notional.",
    link: "https://www.electoralcommission.org.uk/",
  },
];

const MODELS = [
  {
    name: "Marginality Score",
    type: "Scored ranking",
    signals: "Majority %, swing deviation from regional average, historical volatility, demographic factor",
    scope: "All 650 UK constituencies",
    interpretation: "Higher score = more marginal. Useful for prioritising campaign resource. Not a vote share prediction.",
    limitations: "Does not account for incumbency effects or candidate quality.",
  },
  {
    name: "Vulnerability Score",
    type: "Scored ranking",
    signals: "Labour threat, Reform threat, Lib Dem threat, Marginality composite",
    scope: "Conservative-held seats (117 after 2024 GE)",
    interpretation: "Higher score = more vulnerable. Primary threat column identifies the most likely challenger party.",
    limitations: "Scores are relative, not absolute. A score of 8/10 does not mean 80% chance of loss.",
  },
  {
    name: "Reform Threat Index",
    type: "Scored ranking (v3.0, directional model)",
    signals: "Con→Reform swing 2019→2024, Reform 2024 share, Conservative 2024 majority, council Reform strength, demographic alignment (Leave vote + degree share)",
    scope: "Conservative-held seats",
    interpretation: "Identifies structural vulnerability to Reform UK, not a vote share forecast.",
    limitations: "Reform's future performance is highly uncertain. The model captures 2024 patterns, not post-2024 realignment.",
  },
  {
    name: "Lib Dem Threat Index",
    type: "Scored ranking",
    signals: "LD 2024 share (25%), LD trend 2019→2024 (25%), Conservative majority % (25%), graduate population % (15%), owner occupancy % (10%)",
    scope: "Conservative-held seats (England and Wales), top 50",
    interpretation: "Higher score = stronger structural Lib Dem challenge. Correlates with 2019 Remain-leaning suburban seats.",
    limitations: "Excludes Scotland and Northern Ireland. Does not model specific candidate effects or by-election dynamics.",
  },
  {
    name: "Green Threat Index",
    type: "Scored ranking",
    signals: "Green 2024 share (30%), Green trend 2019→2024 (25%), incumbent majority % (20%), graduate population % (15%), urban density score (10%)",
    scope: "Conservative and Labour-held seats where Green received >5% in 2024 (England and Wales), top 30",
    interpretation: "Identifies seats where Green vote is structurally significant and growing. Useful for both parties' defensive planning.",
    limitations: "Green Party performance is highly local and candidate-dependent. Trend uses 2019 notional results.",
  },
  {
    name: "By-Election Risk Score",
    type: "Watchlist model (not statistical prediction)",
    signals: "Majority factor, council instability factor, defection risk factor, polling trend factor",
    scope: "All UK constituencies",
    interpretation: "Identifies seats where structural conditions that historically precede by-elections are present. This is NOT a prediction that a by-election will occur.",
    limitations: "Cannot model unpredictable events (MP death, resignation). Council instability data is incomplete.",
  },
  {
    name: "Target Seats 2029",
    type: "Planning tool (assumption-governed)",
    signals: "Swing required, current majority, Reform squeeze risk, 2024 Con share",
    scope: "Non-Conservative seats in England and Wales (default); UK-wide available",
    interpretation: "Identifies seats where Conservative recovery is structurally most plausible under uniform swing assumptions. Excludes Scotland and NI by default due to different party dynamics.",
    limitations: "Uniform swing assumption. Does not model tactical voting, candidate effects, or post-2024 realignment.",
  },
];

function ReliabilityBadge({ level }) {
  const colours = {
    High: { bg: "#dcfce7", text: "#15803d" },
    Medium: { bg: "#fef9c3", text: "#854d0e" },
    Low: { bg: "#fee2e2", text: "#b91c1c" },
  };
  const c = colours[level] ?? colours.Medium;
  return (
    <span style={{ background: c.bg, color: c.text, borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
      {level}
    </span>
  );
}

export default function DataSourcesPage() {
  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Platform Reference</span>
            <h1 className="portal-page-header__title">Data Sources & Methodology</h1>
            <p className="portal-page-header__subtitle">
              Transparency note on the data underlying Political Solutions intelligence products.
              All models produce structured indicators to support political planning — not statistical
              forecasts of election outcomes. Where estimates are used, they are clearly labelled.
            </p>
          </div>
        </div>
      </Card>

      {/* ── Estimates vs Facts ─────────────────────────────────────────────── */}
      <Card title="Estimates vs. verified facts">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24, marginTop: 16 }}>
          <div>
            <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#15803d" }}>Verified facts</h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              <li>2024 general election results (votes, vote shares, majorities)</li>
              <li>2024 electorate figures</li>
              <li>ONS 2021 census demographic data (England and Wales)</li>
              <li>Official constituency boundaries (PCON 2024)</li>
              <li>Confirmed LGR statutory orders (e.g. Surrey, April 2027)</li>
            </ul>
          </div>
          <div>
            <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#ea580c" }}>Modelled estimates</h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              <li>2019 notional results on 2024 boundaries (all trend calculations)</li>
              <li>Constituency-level Leave vote share (apportioned from counting areas)</li>
              <li>All model scores (marginality, vulnerability, threat indexes)</li>
              <li>Swing scenarios (Scenario Simulator)</li>
              <li>LGR proposed unitary names and vesting dates (subject to change)</li>
            </ul>
          </div>
          <div>
            <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#b91c1c" }}>What we do not claim</h4>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: "#374151", lineHeight: 1.8 }}>
              <li>Vote share predictions for future elections</li>
              <li>That all models carry equal empirical support</li>
              <li>That By-Election Watch scores predict vacancies</li>
              <li>That Scenario Simulator outputs are forecasts</li>
              <li>That threat index scores represent win probabilities</li>
            </ul>
          </div>
        </div>
      </Card>

      {/* ── Data Sources Table ─────────────────────────────────────────────── */}
      <Card title="Data sources">
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Provider</th>
                <th>Coverage</th>
                <th>Last updated</th>
                <th>Reliability</th>
                <th>Key limitations</th>
              </tr>
            </thead>
            <tbody>
              {DATA_SOURCES.map((src) => (
                <tr key={src.name}>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                    <a href={src.link} target="_blank" rel="noopener noreferrer" style={{ color: "inherit" }}>
                      {src.name}
                    </a>
                  </td>
                  <td style={{ fontSize: 13 }}>{src.provider}</td>
                  <td style={{ fontSize: 13 }}>{src.coverage}</td>
                  <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>{src.lastUpdated}</td>
                  <td><ReliabilityBadge level={src.reliability} /></td>
                  <td style={{ fontSize: 12, color: "#6b7280" }}>{src.limitations}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Model Methodology ─────────────────────────────────────────────── */}
      <Card title="Model methodology">
        <p className="portal-data-note" style={{ marginTop: 0 }}>
          All scoring models follow the same pattern: each signal component is normalised to a 0–10 scale,
          clamped to prevent outlier distortion, then combined using fixed weights. Scores are relative rankings
          within the modelled universe — they are not probabilities.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
          {MODELS.map((model) => (
            <div
              key={model.name}
              style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{model.name}</h3>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", background: "#f3f4f6", borderRadius: 4, padding: "2px 8px" }}>
                  {model.type}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, fontSize: 13 }}>
                <div>
                  <div style={{ fontWeight: 600, color: "#374151", marginBottom: 4 }}>Signals</div>
                  <div style={{ color: "#6b7280" }}>{model.signals}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: "#374151", marginBottom: 4 }}>Scope</div>
                  <div style={{ color: "#6b7280" }}>{model.scope}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: "#374151", marginBottom: 4 }}>Interpretation</div>
                  <div style={{ color: "#6b7280" }}>{model.interpretation}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 600, color: "#b91c1c", marginBottom: 4 }}>Limitations</div>
                  <div style={{ color: "#6b7280" }}>{model.limitations}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Update Cadence ─────────────────────────────────────────────────── */}
      <Card title="Update cadence">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginTop: 16, fontSize: 14 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Election data</div>
            <div style={{ color: "#6b7280" }}>Updated following each general election and significant by-election. 2024 data is current.</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Model scores</div>
            <div style={{ color: "#6b7280" }}>Recalculated on demand by running the relevant Python script. Scores reflect data at time of last calculation run.</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>LGR status</div>
            <div style={{ color: "#6b7280" }}>Updated as MHCLG decisions are announced. Wave 2 consultation closed March 2026; decisions expected late 2026.</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Demographics</div>
            <div style={{ color: "#6b7280" }}>2021 census data. Next ONS update expected post-2031 census. Structural variables (graduate share, tenure) are stable over medium term.</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Threat indexes</div>
            <div style={{ color: "#6b7280" }}>Calculated once per cycle. Updated when new polling data or electoral events provide materially different signal inputs.</div>
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Local government results</div>
            <div style={{ color: "#6b7280" }}>Updated following May election cycles. By-election results between cycles may lag.</div>
          </div>
        </div>
      </Card>

      {/* ── Footer Disclaimer ──────────────────────────────────────────────── */}
      <Card>
        <div className="portal-data-note" style={{ marginTop: 0 }}>
          <strong>Disclaimer.</strong> All intelligence products on this platform are analytical tools
          designed to support political planning and campaign strategy. They are produced using publicly
          available data and statistical modelling. They do not constitute professional legal, regulatory,
          or electoral advice. Model scores and rankings are indicators only — they do not predict
          individual election outcomes. Political Solutions accepts no liability for decisions made
          on the basis of these tools.
        </div>
        <div style={{ marginTop: 16, fontSize: 13, color: "#6b7280" }}>
          For questions about data or methodology:{" "}
          <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>
          {" · "}
          <Link to="/portal/analytics/model-performance">Model Performance →</Link>
        </div>
      </Card>
    </div>
  );
}
