import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import { getQuoteRequests } from "../../lib/quoteApi.js";
import { formatCurrency } from "../../utils/formatters.js";

const formatDate = (value) => {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB");
};

const renderXeroStatus = (xero) => {
  if (!xero?.requested) return "Not requested";
  if (xero?.created) return "Created";
  if (xero?.errorCode) return "Failed";
  return "Pending";
};

export default function Quotes() {
  const [state, setState] = useState({
    loading: true,
    error: "",
    items: [],
    nextKey: "",
  });

  const loadQuotes = async (mode = "replace") => {
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    try {
      const result = await getQuoteRequests({
        limit: 20,
        lastKey: mode === "append" ? state.nextKey : "",
      });
      setState((prev) => ({
        loading: false,
        error: "",
        items: mode === "append" ? [...prev.items, ...(result.items || [])] : result.items || [],
        nextKey: result.nextKey || "",
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: "Unable to load quote requests.",
      }));
    }
  };

  useEffect(() => {
    loadQuotes("replace");
  }, []);

  return (
    <div className="stack">
      <Card title="Quote requests">
        <p className="muted" style={{ marginTop: 0 }}>
          Monitor quote requests and Xero invoice status.
        </p>
        {state.loading && <div className="muted">Loading quotes...</div>}
        {state.error && <div className="status error">{state.error}</div>}
        <div style={{ overflowX: "auto" }}>
          <table className="table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr className="muted" style={{ textAlign: "left" }}>
                <th style={{ padding: "8px 4px" }}>Reference</th>
                <th style={{ padding: "8px 4px" }}>Created</th>
                <th style={{ padding: "8px 4px" }}>Organisation</th>
                <th style={{ padding: "8px 4px" }}>Email</th>
                <th style={{ padding: "8px 4px" }}>Total</th>
                <th style={{ padding: "8px 4px" }}>Xero</th>
              </tr>
            </thead>
            <tbody>
              {state.items.map((item) => (
                <tr key={item.referenceId} style={{ borderTop: "1px solid #e5e7eb" }}>
                  <td style={{ padding: "8px 4px" }}>
                    <Link to={`/portal/ops/quotes/${encodeURIComponent(item.referenceId)}`}>
                      {item.referenceId}
                    </Link>
                  </td>
                  <td style={{ padding: "8px 4px" }}>{formatDate(item.createdAt)}</td>
                  <td style={{ padding: "8px 4px" }}>{item.customerOrganisation || "N/A"}</td>
                  <td style={{ padding: "8px 4px" }}>{item.customerEmailMasked || "N/A"}</td>
                  <td style={{ padding: "8px 4px" }}>
                    {formatCurrency(item.totals?.subtotal || 0)}
                  </td>
                  <td style={{ padding: "8px 4px" }}>{renderXeroStatus(item.xero)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Button variant="secondary" onClick={() => loadQuotes("replace")} disabled={state.loading}>
            Refresh
          </Button>
          {state.nextKey && (
            <Button variant="ghost" onClick={() => loadQuotes("append")} disabled={state.loading}>
              Load more
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
