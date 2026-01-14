import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import Card from "../components/Card.jsx";
import associations from "../data/associations.json";
import { calculateFederationPricing } from "../portal/pricing/federationPricing.js";

const gbp = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function SignUp() {
  const [searchParams] = useSearchParams();
  const association = searchParams.get("association") ?? "";
  const countParam = Number(searchParams.get("count") ?? 0);

  const constituencies = useMemo(() => {
    if (!association) return [];
    return associations.byAssociation[association] ?? [];
  }, [association]);

  const constituencyCount = constituencies.length || countParam;
  const pricing = association && constituencyCount ? calculateFederationPricing(constituencyCount) : null;

  return (
    <div className="page stack">
      <Card>
        <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Sign Up</h1>
        {!association ? (
          <p className="muted">No association selected.</p>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{association}</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {constituencyCount} constituenc{constituencyCount === 1 ? "y" : "ies"}
              </div>
            </div>
            {constituencies.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Included constituencies</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {constituencies.map((constituency) => (
                    <li key={constituency}>{constituency}</li>
                  ))}
                </ul>
              </div>
            )}
            {pricing && (
              <div style={{ marginBottom: 16 }}>
                <div>Total (ex VAT): {gbp.format(pricing.netTotal)}</div>
                <div>VAT (20%): {gbp.format(pricing.vatTotal)}</div>
                <div>Total (inc VAT): {gbp.format(pricing.grossTotal)}</div>
              </div>
            )}
            <p className="muted">Sign-up form coming soon.</p>
          </>
        )}
      </Card>
    </div>
  );
}
