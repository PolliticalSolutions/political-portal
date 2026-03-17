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
  const [filter, setFilter] = useState("all");

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

  const filteredItems = state.items.filter((item) => {
    if (filter === "all") return true;
    return (item.requestType || "CHECKOUT") === filter;
  });

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Account and Billing</span>
            <h1 className="portal-page-header__title">Quotes</h1>
            <p className="portal-page-header__subtitle">
              Review quote requests, checkout submissions, and invoice status in one list.
            </p>
          </div>
          <div className="portal-page-header__actions">
            <Button variant="ghost" className="button--small" onClick={() => loadQuotes("replace")} disabled={state.loading}>
              Refresh
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Quote requests">
        <label className="field" style={{ maxWidth: 280 }}>
          <span>Filter</span>
          <select className="input" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="all">All requests</option>
            <option value="CHECKOUT">Checkout</option>
            <option value="SERVICE_ENQUIRY">Service enquiry</option>
          </select>
        </label>
        {state.loading && <div className="muted">Loading quotes...</div>}
        {state.error && <div className="status error">{state.error}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Created</th>
                <th>Type</th>
                <th>Organisation</th>
                <th>Email</th>
                <th>Total</th>
                <th>Xero</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.referenceId}>
                  <td>
                    <Link className="table-link" to={`/portal/ops/quotes/${encodeURIComponent(item.referenceId)}`}>
                      {item.referenceId}
                    </Link>
                  </td>
                  <td>{formatDate(item.createdAt)}</td>
                  <td>
                    {(item.requestType || "CHECKOUT") === "SERVICE_ENQUIRY" ? "Service enquiry" : "Checkout"}
                  </td>
                  <td>{item.customerOrganisation || "N/A"}</td>
                  <td>{item.customerEmailMasked || "N/A"}</td>
                  <td>
                    {formatCurrency(item.totals?.subtotal || 0)}
                  </td>
                  <td>{renderXeroStatus(item.xero)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="portal-section-actions" style={{ marginTop: 16 }}>
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
