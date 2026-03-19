import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { applyForApproval, getAdminMe, getMe, listOrganisations } from "../../lib/uploadApi.js";

function hasAuthTokens() {
  try {
    const raw = sessionStorage.getItem("cognito_tokens");
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed?.access_token || parsed?.id_token);
  } catch {
    return false;
  }
}

function normalizeUserStatus(user) {
  return (user?.status || "").toString().trim().toUpperCase();
}

function PendingApprovalView({ user, onApplied }) {
  const [form, setForm] = useState({
    requestedOrgId: user?.requestedOrgId || "",
    requestedOrgType: user?.requestedOrgType || "ASSOCIATION",
    requestedPconCode: user?.requestedPconCode || "",
  });
  const [organisations, setOrganisations] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgsError, setOrgsError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const hasExistingApplication = Boolean(user?.requestedOrgId || user?.requestedPconCode);
  const selectedOrg = organisations.find((item) => item.orgId === form.requestedOrgId) || null;
  const scopedPcons = Array.isArray(selectedOrg?.pconCodes) ? selectedOrg.pconCodes : [];

  useEffect(() => {
    let cancelled = false;
    setOrgsLoading(true);
    setOrgsError("");
    listOrganisations({ orgType: form.requestedOrgType, active: true })
      .then((result) => {
        if (cancelled) return;
        setOrganisations(Array.isArray(result?.items) ? result.items : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setOrganisations([]);
        setOrgsError(err.message || "Failed to load organisations.");
      })
      .finally(() => {
        if (!cancelled) setOrgsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [form.requestedOrgType]);

  useEffect(() => {
    if (scopedPcons.length === 1) {
      setForm((prev) => ({ ...prev, requestedPconCode: scopedPcons[0] }));
    }
  }, [scopedPcons]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.requestedOrgId.trim()) {
      setError("Organisation selection is required.");
      return;
    }
    if (!form.requestedPconCode.trim()) {
      setError("Requested constituency code is required.");
      return;
    }

    setSaving(true);
    try {
      const result = await applyForApproval({
        requestedOrgId: form.requestedOrgId.trim(),
        requestedPconCode: form.requestedPconCode.trim().toUpperCase(),
      });
      setSuccess("Application details saved. Your account remains pending admin approval.");
      onApplied(result?.user || null);
    } catch (err) {
      setError(err.message || "Failed to submit application details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page stack">
      <Card title="Pending approval">
        <p>
          Your account is pending manual approval. Upload and other portal actions are unavailable until approved.
        </p>
        <p className="muted" style={{ marginTop: 8 }}>
          Status: <strong>{normalizeUserStatus(user) || "PENDING"}</strong>
        </p>
      </Card>

      <Card title="Application details">
        <p className="muted" style={{ marginBottom: 12 }}>
          {hasExistingApplication
            ? "Your submitted details are shown below. You can update them while your status is pending."
            : "Submit the organisation and constituency you are applying for."}
        </p>
        <form className="stack" onSubmit={handleSubmit}>
          <label htmlFor="requestedOrgType" style={{ fontWeight: 600 }}>
            Organisation type
          </label>
          <select
            id="requestedOrgType"
            value={form.requestedOrgType}
            onChange={(e) => setForm((prev) => ({ ...prev, requestedOrgType: e.target.value }))}
          >
            <option value="ASSOCIATION">Association</option>
            <option value="FEDERATION">Federation</option>
          </select>
          <label htmlFor="requestedOrgId" style={{ fontWeight: 600 }}>
            Organisation
          </label>
          <select
            id="requestedOrgId"
            value={form.requestedOrgId}
            onChange={(e) => setForm((prev) => ({ ...prev, requestedOrgId: e.target.value }))}
            disabled={orgsLoading}
          >
            <option value="">Select organisation</option>
            {organisations.map((org) => (
              <option key={org.orgId} value={org.orgId}>
                {org.name}
              </option>
            ))}
          </select>
          {orgsError && (
            <p style={{ margin: 0, color: "#b91c1c" }} role="alert">
              {orgsError}
            </p>
          )}
          {!orgsError && organisations.length === 0 && !orgsLoading && (
            <p style={{ margin: 0, color: "#64748b" }}>No active organisations found.</p>
          )}

          <label htmlFor="requestedPconCode" style={{ fontWeight: 600 }}>
            Requested constituency code (PCON24CD)
          </label>
          {scopedPcons.length > 1 ? (
            <select
              id="requestedPconCode"
              value={form.requestedPconCode}
              onChange={(e) => setForm((prev) => ({ ...prev, requestedPconCode: e.target.value }))}
            >
              <option value="">Select constituency</option>
              {scopedPcons.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="requestedPconCode"
              type="text"
              value={form.requestedPconCode}
              onChange={(e) => setForm((prev) => ({ ...prev, requestedPconCode: e.target.value }))}
              placeholder="e.g. E14000637"
              readOnly={scopedPcons.length === 1}
            />
          )}

          <Button type="submit" loading={saving} disabled={saving}>
            {saving ? "Saving..." : "Submit application"}
          </Button>
        </form>
        {error && (
          <p style={{ marginTop: 12, color: "#b91c1c" }} role="alert">
            {error}
          </p>
        )}
        {success && (
          <p style={{ marginTop: 12, color: "#15803d" }} role="status">
            {success}
          </p>
        )}
      </Card>
    </div>
  );
}

function RejectedView() {
  return (
    <div className="page stack">
      <Card title="Application rejected">
        <p>Your account application was rejected and portal actions are disabled.</p>
        <p className="muted" style={{ marginTop: 8 }}>
          Contact support at <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>.
        </p>
      </Card>
    </div>
  );
}

function ServiceUnavailableView({ message, onRetry, loading }) {
  return (
    <div className="page stack">
      <Card title="Service unavailable">
        <p>{message || "We could not verify your account status right now."}</p>
        <p className="muted">Portal actions are temporarily blocked. Please retry.</p>
        <Button onClick={onRetry} loading={loading} disabled={loading}>
          Retry
        </Button>
      </Card>
    </div>
  );
}

function PortalSkeletonView() {
  return (
    <div className="page stack">
      <div className="container">
        <div className="portal-skeleton-shell">
          <div className="portal-skeleton-card portal-skeleton-card--wide">
            <div className="portal-skeleton-line portal-skeleton-line--label" />
            <div className="portal-skeleton-line portal-skeleton-line--title" />
            <div className="portal-skeleton-line portal-skeleton-line--body" />
          </div>
          <div className="card-grid">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="portal-skeleton-card">
                <div className="portal-skeleton-line portal-skeleton-line--card-title" />
                <div className="portal-skeleton-line portal-skeleton-line--body" />
                <div className="portal-skeleton-line portal-skeleton-line--body-short" />
                <div className="portal-skeleton-cta" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PortalLayout() {
  const navClass = ({ isActive }) => (isActive ? "navLink active" : "navLink");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      if (!hasAuthTokens()) {
        if (!cancelled) {
          setLoading(false);
          setUser({ status: "APPROVED" });
          setServiceUnavailable(false);
        }
        return;
      }

      try {
        const result = await getMe();
        const status = normalizeUserStatus(result?.user);
        if (!cancelled) {
          setUser(result?.user || null);
          setError("");
          setServiceUnavailable(false);
          setLoading(false);
          setIsAdmin(false);
        }

        if (status === "APPROVED") {
          void getAdminMe()
            .then((admin) => {
              if (!cancelled) setIsAdmin(Boolean(admin?.isAdmin));
            })
            .catch(() => {
              if (!cancelled) setIsAdmin(false);
            });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load account status.");
          setUser(null);
          setServiceUnavailable(true);
          setIsAdmin(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadMe();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const status = useMemo(() => normalizeUserStatus(user), [user]);

  if (loading) {
    return <PortalSkeletonView />;
  }

  if (status === "PENDING") {
    return (
      <div className="container">
        {error && (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        )}
        <PendingApprovalView user={user} onApplied={setUser} />
      </div>
    );
  }

  if (status === "REJECTED") {
    return (
      <div className="container">
        {error && (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        )}
        <RejectedView />
      </div>
    );
  }

  if (serviceUnavailable) {
    return (
      <div className="container">
        <ServiceUnavailableView
          message={error}
          loading={loading}
          onRetry={() => {
            setLoading(true);
            setServiceUnavailable(false);
            setReloadKey((value) => value + 1);
          }}
        />
      </div>
    );
  }

  return (
    <div className="page stack">
      <div className="container">
        {error && (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        )}
        <div
          className="no-print"
          style={{ display: "grid", gap: 16 }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>Portal</div>
          <nav className="nav portal-nav-groups" aria-label="Portal">
            <div className="portal-nav-group">
              <span className="portal-nav-group__label">Products</span>
              <NavLink className={navClass} to="/portal" end>
                Dashboard
              </NavLink>
              <NavLink className={navClass} to="/portal/uploads">
                Uploads
              </NavLink>
              <NavLink className={navClass} to="/portal/constituency">
                Constituency Intelligence
              </NavLink>
              <NavLink className={navClass} to="/portal/local-government">
                Local Government
              </NavLink>
              <NavLink className={navClass} to="/portal/local-government/lgr">
                LGR Tracker
              </NavLink>
            </div>
            <div className="portal-nav-group">
              <span className="portal-nav-group__label">Analytics</span>
              <NavLink className={navClass} to="/portal/constituency/reform-threat">
                Reform Threat
              </NavLink>
              <NavLink className={navClass} to="/portal/constituency/libdem-threat">
                Lib Dem Threat
              </NavLink>
              <NavLink className={navClass} to="/portal/constituency/green-threat">
                Green Threat
              </NavLink>
              <NavLink className={navClass} to="/portal/constituency/vulnerability">
                Vulnerability
              </NavLink>
              <NavLink className={navClass} to="/portal/constituency/target-seats">
                Target Seats 2029
              </NavLink>
              <NavLink className={navClass} to="/portal/analytics/by-election-watch">
                By-Election Watch
              </NavLink>
              <NavLink className={navClass} to="/portal/analytics/scenario">
                Scenario modeller
              </NavLink>
              <NavLink className={navClass} to="/portal/analytics/correlations">
                Correlations
              </NavLink>
              <NavLink className={navClass} to="/portal/analytics/model-performance">
                Model Performance
              </NavLink>
              <NavLink className={navClass} to="/portal/data-sources">
                Data Sources
              </NavLink>
            </div>
            <div className="portal-nav-group">
              <span className="portal-nav-group__label">Account</span>
              <NavLink className={navClass} to="/portal/cart">
                Cart
              </NavLink>
              <NavLink className={navClass} to="/portal/settings/integrations">
                Integrations
              </NavLink>
              <NavLink className={navClass} to="/portal/alerts">
                My Alerts
              </NavLink>
            </div>
            <div className="portal-nav-group">
              <span className="portal-nav-group__label">Admin</span>
              <NavLink className={navClass} to="/portal/ops/quotes">
                Quotes
              </NavLink>
              <NavLink className={navClass} to="/services">
                Services
              </NavLink>
              {isAdmin && (
                <NavLink className={navClass} to="/portal/admin/manual-review">
                  Manual review
                </NavLink>
              )}
            </div>
          </nav>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
