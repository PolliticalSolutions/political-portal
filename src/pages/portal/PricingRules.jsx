import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import associations from "../../data/associations.json";
import { calculateFederationPricing } from "../../portal/pricing/federationPricing.js";
import { saveAssociationSelection } from "../../utils/associationStorage.js";
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

  useEffect(() => {
    if (!resolvedAssociation && !selectedConstituency) return;
    saveAssociationSelection({
      association: resolvedAssociation,
      constituency: selectedConstituency,
      constituencyCount,
    });
  }, [resolvedAssociation, selectedConstituency, constituencyCount]);

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
    const returnToParams = new URLSearchParams();
    if (selectedConstituency) {
      returnToParams.set("constituency", selectedConstituency);
    } else if (resolvedAssociation) {
      returnToParams.set("association", resolvedAssociation);
    }
    const returnToQuery = returnToParams.toString();
    const returnTo = `${location.pathname}${returnToQuery ? `?${returnToQuery}` : ""}`;
    const query = new URLSearchParams({
      association: resolvedAssociation,
      count: String(constituencyCount || 1),
      returnTo,
    });
    navigate(`/signup?${query.toString()}`);
  };

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Account and Pricing</span>
            <h1 className="portal-page-header__title">Pricing rules</h1>
            <p className="portal-page-header__subtitle">
              Review association or federation pricing for the current selection and prepare the next account
              setup step.
            </p>
          </div>
          <div className="portal-page-header__actions no-print">
            <Button type="button" variant="ghost" className="button--small" onClick={() => window.print()}>
              Print / Save as PDF
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="portal-page-header" style={{ marginBottom: 16 }}>
          <div className="portal-page-header__content">
            <p className="portal-page-header__subtitle">
              VAT is calculated at the applicable rate for the selected association or federation.
            </p>
          </div>
          <div className="no-print pricing-rules-actions" style={{ textAlign: "right" }}>
            <div className="portal-kpi-note">Use your print dialog to save this breakdown as a PDF.</div>
          </div>
        </div>
        <div className="no-print pricing-rules-controls portal-filter-grid" style={{ marginBottom: 16 }}>
          <div className="field">
            <label htmlFor="association-select">
              Association/Federation
            </label>
            <input
              className="input"
              id="association-filter"
              type="text"
              placeholder="Filter associations..."
              value={associationFilter}
              onChange={(event) => setAssociationFilter(event.target.value)}
              aria-label="Filter associations"
            />
            <Button
              type="button"
              variant="ghost"
              className="button--small"
              onClick={() => setAssociationFilter("")}
              aria-label="Clear association filter"
            >
              Clear
            </Button>
            <select className="input" id="association-select" value={selectedAssociation} onChange={handleAssociationChange}>
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
          <div className="field">
            <label htmlFor="constituency-select">
              Constituency
            </label>
            <input
              className="input"
              id="constituency-filter"
              type="text"
              placeholder="Filter constituencies..."
              value={constituencyFilter}
              onChange={(event) => setConstituencyFilter(event.target.value)}
              aria-label="Filter constituencies"
            />
            <Button
              type="button"
              variant="ghost"
              className="button--small"
              onClick={() => setConstituencyFilter("")}
              aria-label="Clear constituency filter"
            >
              Clear
            </Button>
            <select className="input" id="constituency-select" value={selectedConstituency} onChange={handleConstituencyChange}>
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
            <div className="table-wrap">
              <table className="pricing-rules-table table">
                <tbody>
                  <tr>
                    <td>Base fee</td>
                    <td style={{ textAlign: "right" }}>{gbp.format(pricing.baseFee)}</td>
                  </tr>
                  <tr>
                    <td>
                      Additional constituencies: {Math.max(0, constituencyCount - 1)} ×{" "}
                      {gbp.format(pricing.additionalFee)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      {gbp.format(pricing.additionalFee * Math.max(0, constituencyCount - 1))}
                    </td>
                  </tr>
                </tbody>
                <tfoot className="pricing-rules-totals">
                  <tr>
                    <td style={{ fontWeight: 600 }}>Total (ex VAT)</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                      {gbp.format(pricing.netTotal)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 600 }}>VAT (20%)</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>
                      {gbp.format(pricing.vatTotal)}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ fontWeight: 700 }}>Total (inc VAT)</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>
                      {gbp.format(pricing.grossTotal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="no-print" style={{ marginTop: 16 }}>
              <Button type="button" variant="primary" onClick={handleSignUp}>
                Sign Up
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
