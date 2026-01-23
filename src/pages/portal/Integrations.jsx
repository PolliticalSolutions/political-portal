import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import { createTestInvoice, getXeroStatus, startXeroConnect } from "../../lib/quoteApi.js";

export default function Integrations() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState({
    loading: true,
    connected: false,
    tenantName: "",
    lastConnectedAt: "",
    configured: true,
    missing: [],
    canCreateInvoice: false,
    error: "",
  });
  const [testState, setTestState] = useState({ running: false, message: "", error: "" });

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      try {
        const result = await getXeroStatus({ withAuth: true });
        if (!active) return;
        setStatus({
          loading: false,
          connected: Boolean(result?.connected),
          tenantName: result?.tenantName || "",
          lastConnectedAt: result?.lastConnectedAt || "",
          configured: result?.configured !== false,
          missing: result?.missing || [],
          canCreateInvoice: Boolean(result?.canCreateInvoice),
          error: "",
        });
      } catch (error) {
        if (!active) return;
        setStatus({
          loading: false,
          connected: false,
          tenantName: "",
          lastConnectedAt: "",
          configured: true,
          missing: [],
          canCreateInvoice: false,
          error: "Unable to load integration status.",
        });
      }
    };
    loadStatus();
    return () => {
      active = false;
    };
  }, []);

  const handleConnect = async () => {
    try {
      await startXeroConnect();
    } catch (error) {
      setStatus((prev) => ({
        ...prev,
        error: "Unable to start Xero connect. Check API configuration.",
      }));
    }
  };

  const handleTestInvoice = async () => {
    if (!window.confirm("Create a test invoice in Xero (draft, do not pay)?")) return;
    setTestState({ running: true, message: "", error: "" });
    try {
      const result = await createTestInvoice();
      setTestState({
        running: false,
        message: `Test invoice created: ${result.invoiceNumber || result.invoiceId}`,
        error: "",
      });
    } catch (error) {
      setTestState({
        running: false,
        message: "",
        error: "Test invoice failed. Check the logs and Xero settings.",
      });
    }
  };

  const connectState = searchParams.get("xero");

  return (
    <div className="stack">
      <Card title="Integrations">
        <p className="muted" style={{ marginTop: 0 }}>
          Connect Xero to create invoices and collect payment securely via Xero.
        </p>
        {connectState === "connected" && (
          <div className="status" style={{ marginTop: 12 }}>
            Xero connection updated.
          </div>
        )}
        {connectState === "error" && (
          <div className="status error" style={{ marginTop: 12 }}>
            Xero connection failed. Please try again.
          </div>
        )}
        {connectState === "invalid" && (
          <div className="status error" style={{ marginTop: 12 }}>
            Xero connection validation failed. Please reconnect.
          </div>
        )}
      </Card>

      <Card title="Xero">
        {status.loading && <div className="muted">Checking connection status...</div>}
        {!status.loading && (
          <div className="stack" style={{ gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700 }}>
                {status.connected ? "Connected" : "Not connected"}
              </div>
              {status.tenantName && (
                <div className="muted">Tenant: {status.tenantName}</div>
              )}
              {status.lastConnectedAt && (
                <div className="muted">
                  Last connected: {new Date(status.lastConnectedAt).toLocaleString("en-GB")}
                </div>
              )}
              {!status.configured && (
                <div className="status error" style={{ marginTop: 8 }}>
                  Xero configuration missing: {status.missing.join(", ")}.
                </div>
              )}
              {status.error && <div className="status error">{status.error}</div>}
            </div>
            <div>
              <Button variant="primary" onClick={handleConnect}>
                {status.connected ? "Reconnect Xero" : "Connect Xero"}
              </Button>
            </div>
            {status.connected && status.canCreateInvoice && (
              <div className="stack" style={{ gap: 8 }}>
                <Button variant="secondary" onClick={handleTestInvoice} disabled={testState.running}>
                  {testState.running ? "Creating test invoice..." : "Test invoice creation"}
                </Button>
                {testState.message && <div className="status">{testState.message}</div>}
                {testState.error && <div className="status error">{testState.error}</div>}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
