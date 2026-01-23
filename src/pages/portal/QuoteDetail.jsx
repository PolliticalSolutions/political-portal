import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import { createServiceInvoice, getQuoteRequestAdmin, getXeroStatus } from "../../lib/quoteApi.js";
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
  const [xeroConfig, setXeroConfig] = useState({ emailInvoiceEnabled: false });
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({
    amount: "",
    description: "",
    dueDays: "",
    emailInvoice: false,
  });
  const [invoiceErrors, setInvoiceErrors] = useState({});
  const [invoiceStatus, setInvoiceStatus] = useState({ submitting: false, error: "" });

  const loadDetail = async (active) => {
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

  useEffect(() => {
    let active = true;
    if (ref) loadDetail(active);
    return () => {
      active = false;
    };
  }, [ref]);

  useEffect(() => {
    let active = true;
    const loadXero = async () => {
      try {
        const result = await getXeroStatus({ withAuth: true });
        if (!active) return;
        setXeroConfig({ emailInvoiceEnabled: Boolean(result?.emailInvoiceEnabled) });
      } catch {
        if (!active) return;
        setXeroConfig({ emailInvoiceEnabled: false });
      }
    };
    loadXero();
    return () => {
      active = false;
    };
  }, []);

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
  const isServiceEnquiry = state.record?.requestType === "SERVICE_ENQUIRY";

  const handleInvoiceChange = (event) => {
    const { name, value, type, checked } = event.target;
    setInvoiceForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const validateInvoice = () => {
    const nextErrors = {};
    const amount = Number(invoiceForm.amount);
    if (!Number.isFinite(amount) || amount < 1) {
      nextErrors.amount = "Amount must be at least 1.";
    }
    if (!invoiceForm.description.trim()) {
      nextErrors.description = "Description is required.";
    } else if (invoiceForm.description.length > 200) {
      nextErrors.description = "Description is too long.";
    }
    if (invoiceForm.dueDays && Number(invoiceForm.dueDays) <= 0) {
      nextErrors.dueDays = "Due days must be positive.";
    }
    setInvoiceErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleCreateInvoice = async () => {
    if (!state.record?.referenceId) return;
    if (!validateInvoice()) return;
    setInvoiceStatus({ submitting: true, error: "" });
    try {
      const result = await createServiceInvoice(state.record.referenceId, {
        amount: Number(invoiceForm.amount),
        description: invoiceForm.description.trim(),
        dueDays: invoiceForm.dueDays ? Number(invoiceForm.dueDays) : undefined,
        emailInvoice: invoiceForm.emailInvoice,
      });
      if (!result?.ok && result?.errorCode) {
        setInvoiceStatus({
          submitting: false,
          error: `Invoice creation failed (${result.errorCode}).`,
        });
      } else {
        setInvoiceStatus({ submitting: false, error: "" });
        setInvoiceModalOpen(false);
        setInvoiceForm({ amount: "", description: "", dueDays: "", emailInvoice: false });
      }
      await loadDetail(true);
    } catch (error) {
      setInvoiceStatus({
        submitting: false,
        error: "Unable to create invoice. Please try again.",
      });
    }
  };

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
            {isServiceEnquiry && (
              <div>
                <div className="muted">Service enquiry</div>
                <div style={{ fontWeight: 700 }}>Election & by-election support</div>
                <ol className="muted" style={{ marginTop: 8, paddingLeft: 18 }}>
                  <li>Received: {formatDate(state.record.createdAt)}</li>
                  <li>Invoice: {invoiceState}</li>
                </ol>
                {state.record.serviceInvoice && (
                  <div className="muted" style={{ marginTop: 8 }}>
                    Draft invoice: {formatCurrency(state.record.serviceInvoice.amount || 0)} -{" "}
                    {state.record.serviceInvoice.description || "No description"}
                  </div>
                )}
              </div>
            )}
            {isServiceEnquiry && (
              <div>
                <Button variant="primary" onClick={() => setInvoiceModalOpen(true)}>
                  Create draft invoice
                </Button>
              </div>
            )}
            <Button variant="secondary" onClick={copySummary}>
              Copy invoice-ready summary
            </Button>
          </div>
        )}
      </Card>

      {invoiceModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div style={{ maxWidth: 520, width: "100%" }}>
            <Card className="stack" title="Create draft invoice">
            <label className="field">
              <span>Amount (GBP) *</span>
              <input
                className="input"
                name="amount"
                type="number"
                min="1"
                step="0.01"
                value={invoiceForm.amount}
                onChange={handleInvoiceChange}
              />
              {invoiceErrors.amount && <span className="helper">{invoiceErrors.amount}</span>}
            </label>
            <label className="field">
              <span>Description *</span>
              <input
                className="input"
                name="description"
                value={invoiceForm.description}
                onChange={handleInvoiceChange}
              />
              {invoiceErrors.description && (
                <span className="helper">{invoiceErrors.description}</span>
              )}
            </label>
            <label className="field">
              <span>Due days</span>
              <input
                className="input"
                name="dueDays"
                type="number"
                min="1"
                max="30"
                value={invoiceForm.dueDays}
                onChange={handleInvoiceChange}
              />
              {invoiceErrors.dueDays && <span className="helper">{invoiceErrors.dueDays}</span>}
            </label>
            {xeroConfig.emailInvoiceEnabled && (
              <label className="field">
                <span style={{ fontWeight: 600 }}>Invoice email</span>
                <label className="muted" style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <input
                    type="checkbox"
                    name="emailInvoice"
                    checked={invoiceForm.emailInvoice}
                    onChange={handleInvoiceChange}
                  />
                  Email invoice from Xero after creation.
                </label>
              </label>
            )}
            {invoiceStatus.error && <div className="status error">{invoiceStatus.error}</div>}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setInvoiceModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreateInvoice} loading={invoiceStatus.submitting}>
                Create invoice
              </Button>
            </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
