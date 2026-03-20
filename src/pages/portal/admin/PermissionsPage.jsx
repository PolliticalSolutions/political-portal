import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import Card from "../../../components/Card.jsx";
import { getAdminMe } from "../../../lib/uploadApi.js";
import {
  getPermissionsByEmail,
  grantPermission,
  listAssociations,
  listSubscriptions,
  revokePermission,
  setSubscriptionStatus,
} from "../../../lib/permissionsApi.js";
import { getSession } from "../../../auth/session.js";

export default function PermissionsPage() {
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const [associations, setAssociations] = useState([]);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResults, setSearchResults] = useState(null); // null = not searched yet
  const [searching, setSearching] = useState(false);

  const [newCognitoSub, setNewCognitoSub] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [selectedAssocId, setSelectedAssocId] = useState("");
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState("");

  const [banner, setBanner] = useState({ type: "", msg: "" });
  const [activeTab, setActiveTab] = useState("permissions");
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [subscriptionActionId, setSubscriptionActionId] = useState("");

  const adminEmail = getSession()?.user?.email || "";

  // Admin gate
  useEffect(() => {
    getAdminMe()
      .then((r) => setIsAdmin(Boolean(r?.isAdmin)))
      .catch(() => setIsAdmin(false))
      .finally(() => setAdminChecked(true));
  }, []);

  // Load associations for dropdown
  useEffect(() => {
    listAssociations().then(setAssociations).catch(() => {});
  }, []);

  useEffect(() => {
    setSubscriptionsLoading(true);
    listSubscriptions()
      .then(setSubscriptions)
      .catch(() => setSubscriptions([]))
      .finally(() => setSubscriptionsLoading(false));
  }, []);

  if (!adminChecked) {
    return (
      <div className="page stack">
        <p className="muted">Verifying access…</p>
      </div>
    );
  }
  if (!isAdmin) {
    return <Navigate to="/portal" replace />;
  }

  function flashBanner(type, msg) {
    setBanner({ type, msg });
    setTimeout(() => setBanner({ type: "", msg: "" }), 4000);
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchEmail.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const results = await getPermissionsByEmail(searchEmail.trim());
      setSearchResults(results);
      if (results.length > 0) {
        setNewCognitoSub(results[0].cognito_sub);
        setNewEmail(results[0].user_email);
      } else {
        setNewEmail(searchEmail.trim());
        setNewCognitoSub("");
      }
    } catch (err) {
      flashBanner("error", err.message);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleGrant() {
    if (!newCognitoSub.trim() || !newEmail.trim() || !selectedAssocId) {
      flashBanner("error", "Cognito sub, email and association are all required to grant.");
      return;
    }
    setGranting(true);
    try {
      await grantPermission({
        cognitoSub: newCognitoSub.trim(),
        userEmail: newEmail.trim(),
        associationId: selectedAssocId,
        adminEmail,
      });
      flashBanner("success", "Permission granted.");
      const updated = await getPermissionsByEmail(newEmail.trim());
      setSearchResults(updated);
    } catch (err) {
      flashBanner("error", err.message);
    } finally {
      setGranting(false);
    }
  }

  async function handleRevoke(perm) {
    setRevoking(perm.id);
    try {
      await revokePermission({
        permissionId: perm.id,
        adminEmail,
        targetEmail: perm.user_email,
        associationId: perm.association_id,
      });
      flashBanner("success", "Permission revoked.");
      const updated = await getPermissionsByEmail(perm.user_email);
      setSearchResults(updated);
    } catch (err) {
      flashBanner("error", err.message);
    } finally {
      setRevoking("");
    }
  }

  const activePerms = (searchResults || []).filter((p) => p.is_active);
  const inactivePerms = (searchResults || []).filter((p) => !p.is_active);

  async function refreshSubscriptions() {
    const next = await listSubscriptions();
    setSubscriptions(next);
  }

  async function handleSubscriptionOverride(subscription, activatePermissions) {
    setSubscriptionActionId(subscription.id);
    try {
      await setSubscriptionStatus({
        subscriptionId: subscription.id,
        status: activatePermissions ? "active" : "suspended",
        adminEmail,
        activatePermissions,
        notes: activatePermissions ? "Manual admin activation" : "Manual admin suspension",
      });
      flashBanner("success", activatePermissions ? "Subscription activated." : "Subscription suspended.");
      await refreshSubscriptions();
    } catch (err) {
      flashBanner("error", err.message);
    } finally {
      setSubscriptionActionId("");
    }
  }

  function exportSubscriptionsCsv() {
    const headers = [
      "Association",
      "Email",
      "Status",
      "Stripe customer ID",
      "Stripe subscription ID",
      "Amount inc VAT",
      "Renewal date",
    ];
    const rows = subscriptions.map((subscription) => [
      subscription.associations?.name || subscription.association_id || "",
      subscription.user_email || "",
      subscription.status || "",
      subscription.stripe_customer_id || "",
      subscription.stripe_subscription_id || "",
      subscription.amount_inc_vat || "",
      subscription.billing_period_end || "",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "subscriptions.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Admin</span>
            <h1 className="portal-page-header__title">Permissions</h1>
            <p className="portal-page-header__subtitle">
              Manage upload permissions and subscription-linked access.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={activeTab === "permissions" ? "primary" : "ghost"} onClick={() => setActiveTab("permissions")}>
            Permissions
          </Button>
          <Button variant={activeTab === "subscriptions" ? "primary" : "ghost"} onClick={() => setActiveTab("subscriptions")}>
            Subscriptions
          </Button>
        </div>
      </Card>

      {banner.msg && (
        <div
          role="alert"
          style={{
            padding: "10px 14px",
            borderRadius: 6,
            background: banner.type === "error" ? "#fee2e2" : "#dcfce7",
            color: banner.type === "error" ? "#b91c1c" : "#15803d",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {banner.msg}
        </div>
      )}

      {activeTab === "permissions" && (
        <>
      <Card title="Find user">
        <form
          className="stack"
          style={{ gap: 10, maxWidth: 480 }}
          onSubmit={handleSearch}
        >
          <label className="field" htmlFor="searchEmail">
            <span>User email</span>
            <input
              className="input"
              id="searchEmail"
              type="email"
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </label>
          <Button type="submit" loading={searching} disabled={searching || !searchEmail.trim()}>
            Search
          </Button>
        </form>

        {searchResults !== null && (
          <div style={{ marginTop: 16 }}>
            {searchResults.length === 0 ? (
              <p className="muted">No permissions found for this email.</p>
            ) : (
              <>
                <p style={{ fontWeight: 600, marginBottom: 8 }}>
                  {searchResults[0]?.user_email} — {activePerms.length} active permission(s)
                </p>
                {activePerms.length > 0 && (
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Association</th>
                          <th>Granted</th>
                          <th>Granted by</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activePerms.map((perm) => (
                          <tr key={perm.id}>
                            <td>{perm.associations?.name || perm.association_id}</td>
                            <td>
                              {perm.granted_at
                                ? new Date(perm.granted_at).toLocaleDateString("en-GB")
                                : "—"}
                            </td>
                            <td>{perm.granted_by || "—"}</td>
                            <td>
                              <Button
                                variant="ghost"
                                className="button--small"
                                loading={revoking === perm.id}
                                disabled={!!revoking}
                                onClick={() => handleRevoke(perm)}
                              >
                                Revoke
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {inactivePerms.length > 0 && (
                  <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                    {inactivePerms.length} revoked permission(s) not shown.
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </Card>

      {/* Grant new permission */}
      <Card title="Grant permission">
        <div className="stack" style={{ gap: 10, maxWidth: 480 }}>
          <label className="field" htmlFor="grantEmail">
            <span>User email</span>
            <input
              className="input"
              id="grantEmail"
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </label>
          <label className="field" htmlFor="grantCognitoSub">
            <span>Cognito sub</span>
            <input
              className="input"
              id="grantCognitoSub"
              type="text"
              value={newCognitoSub}
              onChange={(e) => setNewCognitoSub(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            />
            <span style={{ fontSize: 12, color: "#64748b" }}>
              Found in the user's JWT ID token (sub claim), or via the AWS Cognito console.
            </span>
          </label>
          <div className="field">
            <label htmlFor="grantAssoc">Association</label>
            <select
              className="input"
              id="grantAssoc"
              value={selectedAssocId}
              onChange={(e) => setSelectedAssocId(e.target.value)}
            >
              <option value="">Select an association</option>
              {associations.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={handleGrant}
            loading={granting}
            disabled={granting || !newCognitoSub.trim() || !newEmail.trim() || !selectedAssocId}
          >
            Grant permission
          </Button>
        </div>
      </Card>
        </>
      )}

      {activeTab === "subscriptions" && (
        <Card
          title="Subscriptions"
          action={
            <Button variant="ghost" onClick={exportSubscriptionsCsv} disabled={subscriptions.length === 0}>
              Export to CSV
            </Button>
          }
        >
          {subscriptionsLoading ? (
            <p className="muted">Loading subscriptions…</p>
          ) : subscriptions.length === 0 ? (
            <p className="muted">No subscription records found.</p>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Association</th>
                    <th>Status</th>
                    <th>Stripe</th>
                    <th>Amount paid</th>
                    <th>Renewal date</th>
                    <th>Override</th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((subscription) => (
                    <tr key={subscription.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>
                          {subscription.associations?.name || subscription.association_id}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>{subscription.user_email}</div>
                      </td>
                      <td>
                        <span className={`status-pill ${
                          subscription.status === "active"
                            ? "success"
                            : subscription.status === "pending"
                              ? "warning"
                              : "secondary"
                        }`}>
                          {subscription.status}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        <div>{subscription.stripe_customer_id || "—"}</div>
                        <div className="muted">{subscription.stripe_subscription_id || subscription.stripe_invoice_id || "—"}</div>
                      </td>
                      <td>
                        {subscription.amount_inc_vat != null ? `£${Number(subscription.amount_inc_vat).toFixed(2)}` : "—"}
                      </td>
                      <td>
                        {subscription.billing_period_end
                          ? new Date(subscription.billing_period_end).toLocaleDateString("en-GB")
                          : "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <Button
                            variant="ghost"
                            className="button--small"
                            loading={subscriptionActionId === subscription.id}
                            disabled={Boolean(subscriptionActionId)}
                            onClick={() => handleSubscriptionOverride(subscription, true)}
                          >
                            Activate
                          </Button>
                          <Button
                            variant="ghost"
                            className="button--small"
                            loading={subscriptionActionId === subscription.id}
                            disabled={Boolean(subscriptionActionId)}
                            onClick={() => handleSubscriptionOverride(subscription, false)}
                          >
                            Suspend
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
