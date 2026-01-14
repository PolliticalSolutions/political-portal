import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Card from "../../components/Card.jsx";
import associations from "../../data/associations.json";
import { calculateFederationPricing } from "../../portal/pricing/federationPricing.js";
import "./pricingRules.print.css";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function PricingRules() {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedAssociation, setSelectedAssociation] = useState("");
  const [selectedConstituency, setSelectedConstituency] = useState("");
  const [associationFilter, setAssociationFilter] = useState("");
  const [constituencyFilter, setConstituencyFilter] = useState("");
  const appliedPreselectRef = useRef(false);

  const associationOptions = useMemo(
    () => Object.keys(associations.byAssociation ?? {}).sort(),
    []
  );
  const constituencyOptions = useMemo(
    () => Object.keys(associations.byConstituency ?? {}).sort(),
    []
  );
  const associationLookup = useMemo(() => new Set(associationOptions), [associationOptions]);

  useEffect(() => {
    if (appliedPreselectRef.current) return;

    const params = new URLSearchParams(location.search);
    const associationParam = params.get("association")?.trim();
    const constituencyParam = params.get("constituency")?.trim();
    let didApply = false;

    if (constituencyParam && associations.byConstituency[constituencyParam]) {
      const resolved = associations.byConstituency[constituencyParam];
      setSelectedConstituency(constituencyParam);
      setSelectedAssociation(resolved);
      didApply = true;
    } else if (associationParam && associationLookup.has(associationParam)) {
      setSelectedAssociation(associationParam);
      setSelectedConstituency("");
      didApply = true;
    }

    appliedPreselectRef.current = true;
    if (didApply && (associationParam || constituencyParam)) {
      navigate(location.pathname, { replace: true });
    }
  }, [associationLookup, location.pathname, location.search, navigate]);

  const normalizedAssociationFilter = associationFilter.trim().toLowerCase();
  const associationMatches = normalizedAssociationFilter
    ? associationOptions.filter((association) =>
        association.toLowerCase().includes(normalizedAssociationFilter)
      )
    : associationOptions;
  const filteredAssociationOptions =
    selectedAssociation && !associationMatches.includes(selectedAssociation)
      ? [selectedAssociation, ...associationMatches]
      : associationMatches;

  const normalizedConstituencyFilter = constituencyFilter.trim().toLowerCase();
  const constituencyMatches = normalizedConstituencyFilter
    ? constituencyOptions.filter((constituency) =>
        constituency.toLowerCase().includes(normalizedConstituencyFilter)
      )
    : constituencyOptions;
  const filteredConstituencyOptions =
    selectedConstituency && !constituencyMatches.includes(selectedConstituency)
      ? [selectedConstituency, ...constituencyMatches]
      : constituencyMatches;

  const resolvedAssociation =
    selectedAssociation ||
    (selectedConstituency ? associations.byConstituency[selectedConstituency] : "");
  const constituencies = resolvedAssociation ? associations.byAssociation[resolvedAssociation] ?? [] : [];
  const constituencyCount = constituencies.length;
  const pricing = resolvedAssociation ? calculateFederationPricing(constituencyCount || 1) : null;

  const associationType = constituencyCount > 1 ? "Federation" : "Association";

  const handleAssociationChange = (event) => {
    const value = event.target.value;
    setSelectedAssociation(value);

    if (!value) {
      setSelectedConstituency("");
      return;
    }

    if (selectedConstituency && !associations.byAssociation[value]?.includes(selectedConstituency)) {
      setSelectedConstituency("");
    }
  };

  const handleConstituencyChange = (event) => {
    const value = event.target.value;
    setSelectedConstituency(value);

    if (!value) {
      setSelectedAssociation("");
      return;
    }

    const association = associations.byConstituency[value] ?? "";
    setSelectedAssociation(association);
  };

  const handleSignUp = () => {
    if (!resolvedAssociation) return;
    const query = new URLSearchParams({
      association: resolvedAssociation,
      count: String(constituencyCount || 1),
    });
    navigate(`/signup?${query.toString()}`);
  };

  return (
    <div className="page stack">
      <Card>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Pricing Rules</h1>
            <p className="muted" style={{ marginBottom: 16 }}>
              VAT calculated at the applicable rate per association or federation.
            </p>
          </div>
          <div className="no-print pricing-rules-actions" style={{ textAlign: "right" }}>
            <button type="button" onClick={() => window.print()}>
              Print / Save as PDF
            </button>
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
              Tip: choose "Save as PDF" in your print dialog.
            </div>
          </div>
        </div>
        <div className="no-print pricing-rules-controls" style={{ display: "grid", gap: 12, marginBottom: 16 }}>
          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="association-select" style={{ fontWeight: 600 }}>
              Association/Federation
            </label>
            <input
              id="association-filter"
              type="text"
              placeholder="Filter associations..."
              value={associationFilter}
              onChange={(event) => setAssociationFilter(event.target.value)}
              aria-label="Filter associations"
            />
            <button type="button" onClick={() => setAssociationFilter("")} aria-label="Clear association filter">
              Clear
            </button>
            <select id="association-select" value={selectedAssociation} onChange={handleAssociationChange}>
              <option value="">Select an association/federation</option>
              {filteredAssociationOptions.map((association) => (
                <option key={association} value={association}>
                  {association}
                </option>
              ))}
            </select>
            {normalizedAssociationFilter && associationMatches.length === 0 ? (
              <span className="muted" style={{ fontSize: 12 }}>
                No matches
              </span>
            ) : null}
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="constituency-select" style={{ fontWeight: 600 }}>
              Constituency
            </label>
            <input
              id="constituency-filter"
              type="text"
              placeholder="Filter constituencies..."
              value={constituencyFilter}
              onChange={(event) => setConstituencyFilter(event.target.value)}
              aria-label="Filter constituencies"
            />
            <button type="button" onClick={() => setConstituencyFilter("")} aria-label="Clear constituency filter">
              Clear
            </button>
            <select id="constituency-select" value={selectedConstituency} onChange={handleConstituencyChange}>
              <option value="">Select a constituency</option>
              {filteredConstituencyOptions.map((constituency) => (
                <option key={constituency} value={constituency}>
                  {constituency}
                </option>
              ))}
            </select>
            {normalizedConstituencyFilter && constituencyMatches.length === 0 ? (
              <span className="muted" style={{ fontSize: 12 }}>
                No matches
              </span>
            ) : null}
          </div>
        </div>
        {!resolvedAssociation ? (
          <p className="muted">Select an association/federation or constituency to see pricing.</p>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{resolvedAssociation}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {associationType} • {constituencyCount} constituenc{constituencyCount === 1 ? "y" : "ies"}
              </div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Included constituencies</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {constituencies.map((constituency) => (
                    <li key={constituency}>{constituency}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="pricing-rules-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <tbody>
                  <tr>
                    <td style={{ padding: "6px 0" }}>Base fee</td>
                    <td style={{ textAlign: "right", padding: "6px 0" }}>{gbp.format(pricing.baseFee)}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: "6px 0" }}>
                      Additional constituencies: {Math.max(0, constituencyCount - 1)} ×{" "}
                      {gbp.format(pricing.additionalFee)}
                    </td>
                    <td style={{ textAlign: "right", padding: "6px 0" }}>
                      {gbp.format(pricing.additionalFee * Math.max(0, constituencyCount - 1))}
                    </td>
                  </tr>
                </tbody>
                <tfoot className="pricing-rules-totals">
                  <tr>
                    <td style={{ paddingTop: 10, fontWeight: 600 }}>Total (ex VAT)</td>
                    <td style={{ textAlign: "right", paddingTop: 10, fontWeight: 600 }}>
                      {gbp.format(pricing.netTotal)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingTop: 6, fontWeight: 600 }}>VAT (20%)</td>
                    <td style={{ textAlign: "right", paddingTop: 6, fontWeight: 600 }}>
                      {gbp.format(pricing.vatTotal)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ paddingTop: 6, fontWeight: 700 }}>Total (inc VAT)</td>
                    <td style={{ textAlign: "right", paddingTop: 6, fontWeight: 700 }}>
                      {gbp.format(pricing.grossTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="no-print" style={{ marginTop: 16 }}>
              <button type="button" onClick={handleSignUp}>
                Sign Up
              </button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
