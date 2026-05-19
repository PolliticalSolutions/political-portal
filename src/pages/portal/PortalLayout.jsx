import { useEffect, useMemo, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import Card from "../../components/Card.jsx";
import Button from "../../components/Button.jsx";
import { applyForApproval, getAdminMe, getMe, listOrganisations } from "../../lib/uploadApi.js";
import { getSession } from "../../auth/session.js";
import { supabase } from "../../lib/supabaseClient.js";
import { getUserSubscriptionStatus } from "../../lib/subscriptionApi.js";
import { PermissionsProvider } from "../../context/PermissionsContext.jsx";
import brandLogo from "../../assets/brand/political-solutions-logo.webp";

function hasAuthTokens() {
  try {
    const raw = localStorage.getItem("cognito_tokens") ?? sessionStorage.getItem("cognito_tokens");
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

const ANALYTICS_EXPANDED_KEY = "ps_portal_analytics_expanded_v1";

function readAnalyticsExpanded() {
  try {
    return localStorage.getItem(ANALYTICS_EXPANDED_KEY) === "true";
  } catch {
    return false;
  }
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
  const [cognitoSub, setCognitoSub] = useState(null);
  const [error, setError] = useState("");
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [analyticsExpanded, setAnalyticsExpanded] = useState(readAnalyticsExpanded);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);
  const [subscriptionStatus, setSubscriptionStatus] = useState("loading");

  useEffect(() => {
    setCognitoSub(getSession()?.user?.sub || null);
  }, []);

  useEffect(() => {
    if (!cognitoSub) {
      setSubscriptionStatus("none");
      return undefined;
    }
    let cancelled = false;
    getUserSubscriptionStatus(cognitoSub)
      .then((status) => {
        if (!cancelled) setSubscriptionStatus(status);
      })
      .catch(() => {
        if (!cancelled) setSubscriptionStatus("none");
      });
    return () => {
      cancelled = true;
    };
  }, [cognitoSub]);

  useEffect(() => {
    try {
      localStorage.setItem(ANALYTICS_EXPANDED_KEY, analyticsExpanded ? "true" : "false");
    } catch {
      // Ignore storage failures.
    }
  }, [analyticsExpanded]);

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

  useEffect(() => {
    async function fetchAlertCount() {
      try {
        const { count } = await supabase
          .from("political_alerts")
          .select("id", { count: "exact", head: true })
          .eq("is_active", true);
        setAlertCount(count || 0);
      } catch {
        // Non-critical — badge stays at 0 on error
      }
    }
    fetchAlertCount();
    const interval = setInterval(fetchAlertCount, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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
    <>
      {/* Mobile hamburger button */}
      <button
        type="button"
        className="portal-sidebar-toggle no-print"
        aria-expanded={sidebarOpen}
        aria-label="Toggle navigation"
        onClick={() => setSidebarOpen((v) => !v)}
      >
        ☰
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="portal-sidebar-overlay open"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="portal-shell">
        {/* Left sidebar */}
        <aside className={`portal-sidebar no-print${sidebarOpen ? " open" : ""}`}>
          <Link
            to="/"
            className="portal-sidebar__brand"
            onClick={() => setSidebarOpen(false)}
          >
            <img
              src={brandLogo}
              alt="Political Solutions"
              width={40}
              height={40}
              className="portal-sidebar__brand-logo"
            />
            <span className="portal-sidebar__brand-name">Political Solutions</span>
          </Link>

          <nav className="portal-nav-groups" aria-label="Portal">
            <div className="portal-nav-group">
              <span className="portal-nav-group__label">Products</span>
              <NavLink className={navClass} to="/portal" end onClick={() => setSidebarOpen(false)}>
                Dashboard
              </NavLink>
              <NavLink className={navClass} to="/portal/uploads" onClick={() => setSidebarOpen(false)}>
                Uploads
              </NavLink>
              <NavLink className={navClass} to="/portal/constituency" onClick={() => setSidebarOpen(false)}>
                Constituency Intelligence
              </NavLink>
              <NavLink className={navClass} to="/portal/local-government" onClick={() => setSidebarOpen(false)}>
                Local Government
              </NavLink>
              <NavLink className={navClass} to="/portal/local-government/lgr" onClick={() => setSidebarOpen(false)}>
                LGR Tracker
              </NavLink>
            </div>

            <div className="portal-nav-group">
              <span className="portal-nav-group__label">Parliamentary Services</span>
              <NavLink className={navClass} to="/portal/mp-persona" onClick={() => setSidebarOpen(false)}>
                Parliamentary Communications
              </NavLink>
            </div>

            <div className="portal-nav-group">
              <span className="portal-nav-group__label">Campaigns</span>
              <NavLink className={navClass} to="/portal/campaigns" end onClick={() => setSidebarOpen(false)}>
                Sessions
              </NavLink>
              <NavLink className={navClass} to="/portal/campaigns/volunteers" onClick={() => setSidebarOpen(false)}>
                Volunteers
              </NavLink>
              {isAdmin && (
                <NavLink className={navClass} to="/portal/campaigns/activity" onClick={() => setSidebarOpen(false)}>
                  Activity
                </NavLink>
              )}
            </div>

            <div className="portal-nav-group">
              <span className="portal-nav-group__label">Analytics</span>
              <NavLink className={navClass} to="/portal/constituency/reform-threat" onClick={() => setSidebarOpen(false)}>
                Reform Threat
              </NavLink>
              <NavLink className={navClass} to="/portal/constituency/libdem-threat" onClick={() => setSidebarOpen(false)}>
                Lib Dem Threat
              </NavLink>
              <NavLink className={navClass} to="/portal/constituency/vulnerability" onClick={() => setSidebarOpen(false)}>
                Vulnerability
              </NavLink>
              <NavLink className={navClass} to="/portal/constituency/target-seats" onClick={() => setSidebarOpen(false)}>
                Target Seats 2029
              </NavLink>
              <button
                type="button"
                className="portal-nav-toggle"
                aria-expanded={analyticsExpanded}
                onClick={() => setAnalyticsExpanded((value) => !value)}
              >
                {analyticsExpanded ? "Fewer analytics" : "More analytics"}
              </button>
              {analyticsExpanded && (
                <>
                  <NavLink className={navClass} to="/portal/constituency/green-threat" onClick={() => setSidebarOpen(false)}>
                    Green Threat
                  </NavLink>
                  <NavLink className={navClass} to="/portal/analytics/by-election-watch" onClick={() => setSidebarOpen(false)}>
                    By-Election Watch
                  </NavLink>
                  <NavLink className={navClass} to="/portal/analytics/scenario" onClick={() => setSidebarOpen(false)}>
                    Scenario modeller
                  </NavLink>
                  <NavLink className={navClass} to="/portal/analytics/correlations" onClick={() => setSidebarOpen(false)}>
                    Correlations
                  </NavLink>
                  <NavLink className={navClass} to="/portal/analytics/model-performance" onClick={() => setSidebarOpen(false)}>
                    Model Performance
                  </NavLink>
                  <NavLink className={navClass} to="/portal/data-sources" onClick={() => setSidebarOpen(false)}>
                    Data Sources
                  </NavLink>
                </>
              )}
            </div>

            <div className="portal-nav-group">
              <span className="portal-nav-group__label">Account</span>
              <NavLink className={navClass} to="/portal/cart" onClick={() => setSidebarOpen(false)}>
                Cart
              </NavLink>
              <NavLink className={navClass} to="/portal/settings/integrations" onClick={() => setSidebarOpen(false)}>
                Integrations
              </NavLink>
              <NavLink className={navClass} to="/portal/alerts/by-election-risk" onClick={() => setSidebarOpen(false)}>
                By-Election Risk
              </NavLink>
              <NavLink className={navClass} to="/portal/alerts" onClick={() => setSidebarOpen(false)}>
                My Alerts
                {alertCount > 0 && (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 18,
                      height: 18,
                      borderRadius: 9,
                      background: "#dc2626",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "0 4px",
                      marginLeft: 6,
                      lineHeight: 1,
                    }}
                  >
                    {alertCount > 99 ? "99+" : alertCount}
                  </span>
                )}
              </NavLink>
            </div>

            <div className="portal-nav-group">
              <span className="portal-nav-group__label">Admin</span>
              <NavLink className={navClass} to="/portal/admin/crm" onClick={() => setSidebarOpen(false)}>
                CRM
              </NavLink>
              <NavLink className={navClass} to="/portal/ops/quotes" onClick={() => setSidebarOpen(false)}>
                Quotes
              </NavLink>
              <NavLink className={navClass} to="/services" onClick={() => setSidebarOpen(false)}>
                Services
              </NavLink>
              {isAdmin && (
                <NavLink className={navClass} to="/portal/admin/manual-review" onClick={() => setSidebarOpen(false)}>
                  Manual review
                </NavLink>
              )}
              {isAdmin && (
                <NavLink className={navClass} to="/portal/admin/users" onClick={() => setSidebarOpen(false)}>
                  Users
                </NavLink>
              )}
              {isAdmin && (
                <NavLink className={navClass} to="/portal/admin/associations" onClick={() => setSidebarOpen(false)}>
                  Associations
                </NavLink>
              )}
              {isAdmin && (
                <NavLink className={navClass} to="/portal/admin/elections" onClick={() => setSidebarOpen(false)}>
                  Elections
                </NavLink>
              )}
              {isAdmin && (
                <NavLink className={navClass} to="/portal/admin/system-health" onClick={() => setSidebarOpen(false)}>
                  System Health
                </NavLink>
              )}
            </div>
          </nav>
        </aside>

        {/* Main content */}
        <div className="portal-content">
          {error && (
            <p role="alert" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          {subscriptionStatus !== "loading" && !["active", "trialing"].includes(subscriptionStatus) && (
            <div className="status warning" style={{ marginBottom: 16 }}>
              <span>You're on a free demo. Upgrade to unlock full access.</span>
              <Link to="/subscribe" className="button secondary">
                Upgrade
              </Link>
            </div>
          )}
          <PermissionsProvider cognitoSub={cognitoSub}>
            <Outlet />
          </PermissionsProvider>
        </div>
      </div>
    </>
  );
}
