import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import { getQuoteRequestAdmin } from "../../lib/quoteApi.js";
import { formatCurrency } from "../../utils/formatters.js";

const formatDate = (value) => {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB");
};

const resolveInvoiceState = (record) => {
  if (!record?.xero?.requested) return "Not requested";
  if (record?.xero?.errorCode) return "Failed";
  if (record?.xero?.created) {
    const status = (record.xero.status || "").toUpperCase();
    if (status === "DRAFT") return "Draft";
    if (["SUBMITTED", "AUTHORISED", "PAID"].includes(status)) return "Sent";
    return "Created";
  }
  return "Pending";
};

const resolveErrorAction = (code) => {
  if (!code) return "";
  const actions = {
    XERO_NOT_CONNECTED: "Connect Xero in Integrations, then retry the invoice in Xero.",
    XERO_CONFIG_MISSING: "Set Xero sales account code and tax type, then retry.",
    XERO_INVOICE_FAILED: "Check logs, then create the invoice manually in Xero.",
  };
  return actions[code] || "Check logs and create the invoice manually in Xero.";
};

export default function QuoteDetail() {
  const { ref } = useParams();
  const [state, setState] = useState({ loading: true, error: "", record: null });

  useEffect(() => {
    let active = true;
    const loadDetail = async () => {
      setState({ loading: true, error: "", record: null });
      try {
        const result = await getQuoteRequestAdmin(ref);
        if (!active) return;
        setState({ loading: false, error: "", record: result.record });
      } catch (error) {
        if (!active) return;
        setState({ loading: false, error: "Unable to load quote details.", record: null });
      }
    };
    if (ref) loadDetail();
    return () => {
      active = false;
    };
  }, [ref]);

  const summaryText = useMemo(() => {
    if (!state.record) return "";
    const lines = [
      `Reference: ${state.record.referenceId}`,
      `Created: ${state.record.createdAt}`,
      `Organisation: ${state.record.customer?.organisation || ""}`,
      `Email: ${state.record.customer?.email || ""}`,
      "",
      "Items:",
      ...(state.record.items || []).map(
        (item) =>
          `- ${item.name} (${formatCurrency(item.unitPrice || 0)} x ${item.quantity || 1})`
      ),
      "",
      `Subtotal: ${formatCurrency(state.record.totals?.subtotal || 0)}`,
      state.record.compliance?.statement ? "" : null,
      state.record.compliance?.statement || null,
    ];
    return lines.filter(Boolean).join("\n");
  }, [state.record]);

  const invoiceState = useMemo(() => resolveInvoiceState(state.record), [state.record]);
  const errorAction = useMemo(
    () => resolveErrorAction(state.record?.xero?.errorCode || ""),
    [state.record]
  );

  const copySummary = async () => {
    if (!summaryText) return;
    try {
      await navigator.clipboard.writeText(summaryText);
    } catch {
      return;
    }
  };

  return (
    <div className="stack">
      <Card title="Quote detail">
        <div style={{ marginBottom: 12 }}>
          <Button as={Link} to="/portal/ops/quotes" variant="ghost">
            Back to quotes
          </Button>
        </div>
        {state.loading && <div className="muted">Loading quote details...</div>}
        {state.error && <div className="status error">{state.error}</div>}
        {state.record && (
          <div className="stack" style={{ gap: 16 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{state.record.referenceId}</div>
              <div className="muted">{formatDate(state.record.createdAt)}</div>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <div>
                <div className="muted">Organisation</div>
                <div style={{ fontWeight: 700 }}>{state.record.customer?.organisation || "N/A"}</div>
              </div>
              <div>
                <div className="muted">Contact</div>
                <div>{state.record.customer?.name || "N/A"}</div>
                <div className="muted">{state.record.customer?.email || "N/A"}</div>
              </div>
              {state.record.customer?.phone && (
                <div>
                  <div className="muted">Phone</div>
                  <div>{state.record.customer.phone}</div>
                </div>
              )}
            </div>
            <div>
              <div className="muted">Items</div>
              <div className="stack" style={{ gap: 8, marginTop: 8 }}>
                {(state.record.items || []).map((item) => (
                  <div key={item.sku || item.name} className="cart-line">
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{item.name}</div>
                        <div className="muted">
                          Qty {item.quantity || 1} - {item.billingPeriod || "one-off"}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700 }}>
                        {formatCurrency((item.unitPrice || 0) * (item.quantity || 1))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="muted">Totals</div>
              <div style={{ fontWeight: 700 }}>
                {formatCurrency(state.record.totals?.subtotal || 0)}
              </div>
            </div>
            <div>
              <div className="muted">Xero status</div>
              <div style={{ fontWeight: 700 }}>{invoiceState}</div>
              {state.record.xero?.invoiceNumber && (
                <div className="muted">Invoice: {state.record.xero.invoiceNumber}</div>
              )}
              {state.record.xero?.status && (
                <div className="muted">Xero status: {state.record.xero.status}</div>
              )}
              {state.record.xero?.errorCode && (
                <div className="status error" style={{ marginTop: 8 }}>
                  Error code: {state.record.xero.errorCode}
                </div>
              )}
              {errorAction && (
                <div className="status" style={{ marginTop: 8 }}>
                  Recommended action: {errorAction}
                </div>
              )}
              {state.record.xero?.error && (
                <div className="status error">{state.record.xero.error}</div>
              )}
            </div>
            {state.record.notes && (
              <div>
                <div className="muted">Notes</div>
                <div>{state.record.notes}</div>
              </div>
            )}
            <Button variant="secondary" onClick={copySummary}>
              Copy invoice-ready summary
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
