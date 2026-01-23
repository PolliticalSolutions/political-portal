import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import { readStoredQuoteRequest } from "../data/quoteRequest.js";
import { getQuoteRequest } from "../lib/quoteApi.js";
import { formatCurrency } from "../utils/formatters.js";
import "./Cart.css";

export default function CheckoutConfirmation({ basePath = "" }) {
  const [searchParams] = useSearchParams();
  const referenceId = searchParams.get("ref") || "";
  const [record, setRecord] = useState(() => readStoredQuoteRequest(referenceId));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const prefix = basePath ? basePath.replace(/\/$/, "") : "";
  const buildPath = (path) => `${prefix}${path}`;
  const invoiceFailed =
    record?.xero?.requested && !record?.xero?.created && Boolean(record?.xero?.errorCode);
  const invoicePending =
    record?.xero?.requested && !record?.xero?.created && !record?.xero?.errorCode;

  useEffect(() => {
    if (!referenceId || record) return;
    let active = true;
    const fetchRecord = async () => {
      setLoading(true);
      try {
        const result = await getQuoteRequest(referenceId);
        if (!active) return;
        setRecord(result?.record || null);
        setLoadError("");
      } catch (error) {
        if (!active) return;
        setLoadError("We could not load the request details right now.");
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchRecord();
    return () => {
      active = false;
    };
  }, [referenceId, record]);

  return (
    <div className="page stack">
      <Card>
        <h1 style={{ margin: "0 0 12px", fontSize: 22 }}>Request received</h1>
        <p className="muted">Thank you. We have received your request and will be in touch shortly.</p>
        {referenceId && (
          <div className="status" style={{ marginTop: 16 }}>
            Reference: {referenceId}
          </div>
        )}
        {record?.createdAt && (
          <div className="muted" style={{ marginTop: 8 }}>
            Submitted: {new Date(record.createdAt).toLocaleString("en-GB")}
          </div>
        )}
        {loading && <div className="muted" style={{ marginTop: 8 }}>Loading request details...</div>}
        {loadError && <div className="status error" style={{ marginTop: 8 }}>{loadError}</div>}
      </Card>

      {record && (
        <Card title="Request summary">
          <div className="stack" style={{ gap: 12 }}>
            {(record.items || []).map((item) => (
              <div key={item.sku || item.name} className="cart-line">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{item.name}</div>
                    <div className="muted">
                      {item.billingPeriod === "annual"
                        ? "Annual"
                        : item.billingPeriod === "monthly"
                          ? "Monthly"
                          : "One-off"}{" "}
                      - Qty {item.quantity || 1}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700 }}>
                    {formatCurrency((item.unitPrice || 0) * (item.quantity || 1))}
                  </div>
                </div>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 16,
              }}
            >
              <span className="muted">Subtotal</span>
              <span style={{ fontWeight: 700 }}>
                {formatCurrency(record.totals?.subtotal || 0)}
              </span>
            </div>
          </div>
        </Card>
      )}

      {record?.xero?.invoiceId && (
        <Card title="Invoice details">
          <div className="stack" style={{ gap: 8 }}>
            {record.xero.invoiceNumber && (
              <div>
                <span className="muted">Invoice number</span>
                <div style={{ fontWeight: 700 }}>{record.xero.invoiceNumber}</div>
              </div>
            )}
            {record.xero.status && (
              <div>
                <span className="muted">Status</span>
                <div style={{ fontWeight: 700 }}>{record.xero.status}</div>
              </div>
            )}
            <div className="muted">
              Please pay using the Xero invoice email or the payment link provided there.
            </div>
          </div>
        </Card>
      )}

      {invoicePending && (
        <Card title="Invoice update">
          <p className="muted" style={{ marginTop: 0 }}>
            We received your request and will send your Xero invoice shortly.
          </p>
        </Card>
      )}

      {invoiceFailed && (
        <Card title="Invoice update">
          <p className="muted" style={{ marginTop: 0 }}>
            We received your request. Your invoice will be handled manually by our team.
          </p>
          <p className="muted" style={{ marginTop: 8 }}>
            If you need this urgently, contact support and quote your reference number.
          </p>
        </Card>
      )}

      {!record && !loading && referenceId && (
        <Card title="Next steps">
          <p className="muted" style={{ marginTop: 0 }}>
            We have your reference. If you need to update the request, contact our team and quote the
            reference above.
          </p>
        </Card>
      )}

      <Card title="What happens next">
        <ol className="muted" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Our team reviews your request within 1-2 business days.</li>
          <li>We prepare a quote or invoice and confirm any delivery details.</li>
          <li>You receive confirmation by email with next steps and timelines.</li>
        </ol>
      </Card>

      <Card title="Compliance note">
        <p className="muted" style={{ margin: 0 }}>
          Subscriptions provide capability, readiness, and platform support only. They do not cover
          regulated election spending handling or statutory services.
        </p>
      </Card>

      <Card>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontWeight: 700 }}>Need to add more?</div>
            <div className="muted">Return to subscriptions or continue browsing.</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button as={Link} to={buildPath("/subscriptions")} variant="primary">
              View subscriptions
            </Button>
            <Button as={Link} to="/" variant="ghost">
              Back to home
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
