import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import Card from "../../../components/Card.jsx";
import {
  approveAdminUser,
  getAdminMe,
  listAdminUsers,
  listOrganisations as listUploadOrganisations,
  rejectAdminUser,
} from "../../../lib/uploadApi.js";
import {
  getPermissionsByEmail,
  grantPermission,
  listAssociations,
  listSubscriptions,
  revokePermission,
  setSubscriptionStatus,
} from "../../../lib/permissionsApi.js";
import { getSupabaseServiceClient } from "../../../lib/supabaseServiceClient.js";
import { getSession } from "../../../auth/session.js";

const ROOT_ADMIN_EMAIL = "paul@politicalsolutions.uk";

async function fetchMpPersonaFlags(permissionIds) {
  if (!permissionIds || permissionIds.length === 0) return {};
  const db = getSupabaseServiceClient();
  if (!db) return {};
  const { data, error } = await db
    .from("user_permissions")
    .select("id, feature_mp_persona")
    .in("id", permissionIds);
  if (error || !Array.isArray(data)) return {};
  const map = {};
  for (const row of data) {
    map[row.id] = Boolean(row.feature_mp_persona);
  }
  return map;
}

async function updateMpPersonaFlag(permissionId, value) {
  const db = getSupabaseServiceClient();
  if (!db) throw new Error("Supabase service client not available.");
  const { error } = await db
    .from("user_permissions")
    .update({ feature_mp_persona: value })
    .eq("id", permissionId);
  if (error) throw new Error(error.message || "Failed to update MP Persona access.");
}

function MpPersonaToggle({ permission, value, locked, status, onToggle }) {
  const inputId = `mp-persona-toggle-${permission.id}`;
  return (
    <div className="toggle-cell">
      <label className="toggle-switch" htmlFor={inputId}>
        <input
          id={inputId}
          type="checkbox"
          checked={Boolean(value)}
          disabled={Boolean(locked) || status === "saving"}
          onChange={(event) => onToggle(permission, event.target.checked)}
          aria-label={`MP Persona access for ${permission.user_email || "user"}`}
        />
        <span className="toggle-switch__slider" />
      </label>
      {locked && (
        <span className="toggle-cell__status">Always on (admin)</span>
      )}
      {!locked && status === "saving" && (
        <span className="toggle-cell__status">Saving…</span>
      )}
      {!locked && status === "saved" && (
        <span className="toggle-cell__status toggle-cell__status--success">Updated</span>
      )}
      {!locked && status && status !== "saving" && status !== "saved" && (
        <span className="toggle-cell__status toggle-cell__status--error">{status}</span>
      )}
    </div>
  );
}

const USER_STATUSES = ["APPROVED", "PENDING", "REJECTED"];

function normalizeUserStatus(value) {
  const normalized = (value || "").toString().trim().toUpperCase();
  return USER_STATUSES.includes(normalized) ? normalized : "PENDING";
}

function formatDate(value) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-GB");
}

function getRequestedPconCodes(user = {}) {
  const values = Array.isArray(user.requestedPconCodes)
    ? user.requestedPconCodes
    : user.requestedPconCode
      ? [user.requestedPconCode]
      : [];
  return Array.from(
    new Set(
      values
        .map((entry) => (entry || "").toString().trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function formatPconCodes(codes = []) {
  return Array.isArray(codes) && codes.length > 0 ? codes.join(", ") : "—";
}

function parsePconCodes(value) {
  return Array.from(
    new Set(
      (value || "")
        .split(/[\s,]+/)
        .map((entry) => entry.trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

function buildUserForm(user = {}, organisationsByType = {}) {
  const orgType = (user.orgType || user.requestedOrgType || "ASSOCIATION").toString().trim().toUpperCase();
  const safeOrgType = orgType === "FEDERATION" ? "FEDERATION" : "ASSOCIATION";
  const orgId = (user.orgId || user.requestedOrgId || "").toString().trim();
  const currentCodes = Array.isArray(user.allowedPconCodes) ? user.allowedPconCodes : [];
  const requestedCodes = getRequestedPconCodes(user);
  const org = (organisationsByType[safeOrgType] || []).find((item) => item.orgId === orgId) || null;
  const orgCodes = Array.isArray(org?.pconCodes) ? org.pconCodes : [];
  const allowedPconCodes = currentCodes.length > 0 ? currentCodes : requestedCodes.length > 0 ? requestedCodes : orgCodes;

  return {
    orgType: safeOrgType,
    orgId,
    allowedPconCodesText: allowedPconCodes.join(", "),
    rejectReason: (user.rejectedReason || "").toString(),
  };
}

function getStatusPillClass(status) {
  if (status === "APPROVED") return "success";
  if (status === "PENDING") return "warning";
  return "secondary";
}

export default function PermissionsPage() {
  const [adminChecked, setAdminChecked] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeTab, setActiveTab] = useState("users");
  const [banner, setBanner] = useState({ type: "", msg: "" });

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersStatus, setUsersStatus] = useState("APPROVED");
  const [usersSearch, setUsersSearch] = useState("");
  const [usersReloadKey, setUsersReloadKey] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userForm, setUserForm] = useState({
    orgType: "ASSOCIATION",
    orgId: "",
    allowedPconCodesText: "",
    rejectReason: "",
  });
  const [userActionId, setUserActionId] = useState("");
  const [organisationsByType, setOrganisationsByType] = useState({ ASSOCIATION: [], FEDERATION: [] });
  const [organisationsLoading, setOrganisationsLoading] = useState(false);
  const [organisationsError, setOrganisationsError] = useState("");

  const [associations, setAssociations] = useState([]);
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [newCognitoSub, setNewCognitoSub] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [selectedAssocId, setSelectedAssocId] = useState("");
  const [granting, setGranting] = useState(false);
  const [revoking, setRevoking] = useState("");

  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [subscriptionActionId, setSubscriptionActionId] = useState("");

  const [mpPersonaFlags, setMpPersonaFlags] = useState({});
  const [mpPersonaStatus, setMpPersonaStatus] = useState({});

  const adminEmail = getSession()?.user?.email || "";

  function flashBanner(type, msg) {
    setBanner({ type, msg });
    setTimeout(() => setBanner({ type: "", msg: "" }), 4000);
  }

  useEffect(() => {
    getAdminMe()
      .then((result) => setIsAdmin(Boolean(result?.isAdmin)))
      .catch(() => setIsAdmin(false))
      .finally(() => setAdminChecked(true));
  }, []);

  useEffect(() => {
    if (!isAdmin || activeTab !== "users") return undefined;
    let cancelled = false;

    setOrganisationsLoading(true);
    setOrganisationsError("");

    Promise.all([
      listUploadOrganisations({ orgType: "ASSOCIATION", active: true }),
      listUploadOrganisations({ orgType: "FEDERATION", active: true }),
    ])
      .then(([associationsResult, federationsResult]) => {
        if (cancelled) return;
        setOrganisationsByType({
          ASSOCIATION: Array.isArray(associationsResult?.items) ? associationsResult.items : [],
          FEDERATION: Array.isArray(federationsResult?.items) ? federationsResult.items : [],
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setOrganisationsByType({ ASSOCIATION: [], FEDERATION: [] });
        setOrganisationsError(error.message || "Failed to load organisations.");
      })
      .finally(() => {
        if (!cancelled) setOrganisationsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, isAdmin]);

  useEffect(() => {
    if (!isAdmin || activeTab !== "users") return undefined;
    let cancelled = false;

    setUsersLoading(true);
    listAdminUsers({ status: usersStatus, limit: 100 })
      .then((result) => {
        if (!cancelled) setUsers(Array.isArray(result?.items) ? result.items : []);
      })
      .catch((error) => {
        if (!cancelled) {
          setUsers([]);
          flashBanner("error", error.message || "Failed to load users.");
        }
      })
      .finally(() => {
        if (!cancelled) setUsersLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, isAdmin, usersStatus, usersReloadKey]);

  useEffect(() => {
    if (!isAdmin || activeTab !== "permissions" || associations.length > 0) return;
    listAssociations().then(setAssociations).catch(() => setAssociations([]));
  }, [activeTab, associations.length, isAdmin]);

  useEffect(() => {
    if (!isAdmin || activeTab !== "subscriptions") return undefined;
    let cancelled = false;

    setSubscriptionsLoading(true);
    listSubscriptions()
      .then((result) => {
        if (!cancelled) setSubscriptions(result);
      })
      .catch(() => {
        if (!cancelled) setSubscriptions([]);
      })
      .finally(() => {
        if (!cancelled) setSubscriptionsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, isAdmin]);

  const selectedUser = useMemo(
    () => users.find((user) => user.userId === selectedUserId) || null,
    [selectedUserId, users]
  );

  useEffect(() => {
    if (!selectedUserId) return;
    if (selectedUser) {
      setUserForm(buildUserForm(selectedUser, organisationsByType));
      return;
    }
    setSelectedUserId("");
  }, [organisationsByType, selectedUser, selectedUserId]);

  const displayedUsers = useMemo(() => {
    const query = usersSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter((user) =>
      [user.email, user.userId, user.orgId, user.requestedOrgId]
        .filter(Boolean)
        .some((value) => value.toString().toLowerCase().includes(query))
    );
  }, [users, usersSearch]);

  const selectedOrganisationOptions = organisationsByType[userForm.orgType] || [];
  const selectedOrganisation =
    selectedOrganisationOptions.find((item) => item.orgId === userForm.orgId) || null;

  const activePerms = (searchResults || []).filter((permission) => permission.is_active);
  const inactivePerms = (searchResults || []).filter((permission) => !permission.is_active);

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

  function handleSelectUser(user) {
    setSelectedUserId(user.userId);
    setUserForm(buildUserForm(user, organisationsByType));
  }

  function handleOrganisationTypeChange(nextType) {
    setUserForm((current) => ({
      ...current,
      orgType: nextType,
      orgId: "",
      allowedPconCodesText: "",
    }));
  }

  function handleOrganisationChange(nextOrgId) {
    const org = selectedOrganisationOptions.find((item) => item.orgId === nextOrgId) || null;
    const nextCodes = Array.isArray(org?.pconCodes) ? org.pconCodes.join(", ") : "";
    setUserForm((current) => ({
      ...current,
      orgId: nextOrgId,
      allowedPconCodesText: nextCodes || current.allowedPconCodesText,
    }));
  }

  async function handleApproveSelectedUser() {
    if (!selectedUser) return;
    if (!userForm.orgId.trim()) {
      flashBanner("error", "Organisation is required.");
      return;
    }

    const allowedPconCodes = parsePconCodes(userForm.allowedPconCodesText);
    if (allowedPconCodes.length === 0) {
      flashBanner("error", "At least one constituency code is required.");
      return;
    }

    setUserActionId(`${selectedUser.userId}:approve`);
    try {
      await approveAdminUser(selectedUser.userId, {
        orgId: userForm.orgId.trim(),
        orgType: userForm.orgType,
        allowedPconCodes,
      });
      flashBanner("success", "User access saved.");
      setUsersReloadKey((value) => value + 1);
    } catch (error) {
      flashBanner("error", error.message || "Failed to update user.");
    } finally {
      setUserActionId("");
    }
  }

  async function handleRejectSelectedUser() {
    if (!selectedUser) return;
    setUserActionId(`${selectedUser.userId}:reject`);
    try {
      await rejectAdminUser(selectedUser.userId, {
        reason: userForm.rejectReason.trim(),
      });
      flashBanner("success", "User rejected.");
      setUsersReloadKey((value) => value + 1);
    } catch (error) {
      flashBanner("error", error.message || "Failed to reject user.");
    } finally {
      setUserActionId("");
    }
  }

  async function refreshSearchAndFlags(email) {
    const results = await getPermissionsByEmail(email);
    setSearchResults(results);
    const ids = (results || []).map((row) => row.id).filter(Boolean);
    const flags = await fetchMpPersonaFlags(ids);
    setMpPersonaFlags(flags);
    setMpPersonaStatus({});
    return results;
  }

  async function handleSearch(event) {
    event.preventDefault();
    if (!searchEmail.trim()) return;
    setSearching(true);
    setSearchResults(null);
    setMpPersonaFlags({});
    setMpPersonaStatus({});
    try {
      const results = await refreshSearchAndFlags(searchEmail.trim());
      if (results.length > 0) {
        setNewCognitoSub(results[0].cognito_sub);
        setNewEmail(results[0].user_email);
      } else {
        setNewEmail(searchEmail.trim());
        setNewCognitoSub("");
      }
    } catch (error) {
      flashBanner("error", error.message || "Failed to search permissions.");
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleToggleMpPersona(permission, nextValue) {
    if (!permission?.id) return;
    setMpPersonaStatus((current) => ({ ...current, [permission.id]: "saving" }));
    setMpPersonaFlags((current) => ({ ...current, [permission.id]: nextValue }));
    try {
      await updateMpPersonaFlag(permission.id, nextValue);
      setMpPersonaStatus((current) => ({ ...current, [permission.id]: "saved" }));
      setTimeout(() => {
        setMpPersonaStatus((current) => {
          if (current[permission.id] !== "saved") return current;
          const next = { ...current };
          delete next[permission.id];
          return next;
        });
      }, 2000);
    } catch (err) {
      setMpPersonaFlags((current) => ({ ...current, [permission.id]: !nextValue }));
      setMpPersonaStatus((current) => ({
        ...current,
        [permission.id]: err.message || "Failed to update access.",
      }));
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
      await refreshSearchAndFlags(newEmail.trim());
    } catch (error) {
      flashBanner("error", error.message || "Failed to grant permission.");
    } finally {
      setGranting(false);
    }
  }

  async function handleRevoke(permission) {
    setRevoking(permission.id);
    try {
      await revokePermission({
        permissionId: permission.id,
        adminEmail,
        targetEmail: permission.user_email,
        associationId: permission.association_id,
      });
      flashBanner("success", "Permission revoked.");
      await refreshSearchAndFlags(permission.user_email);
    } catch (error) {
      flashBanner("error", error.message || "Failed to revoke permission.");
    } finally {
      setRevoking("");
    }
  }

  async function refreshSubscriptions() {
    setSubscriptions(await listSubscriptions());
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
    } catch (error) {
      flashBanner("error", error.message || "Failed to update subscription.");
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
            <h1 className="portal-page-header__title">Users</h1>
            <p className="portal-page-header__subtitle">
              Manage DynamoDB-backed upload users, Supabase permissions, and subscriptions.
            </p>
          </div>
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant={activeTab === "users" ? "primary" : "ghost"} onClick={() => setActiveTab("users")}>
            Users
          </Button>
          <Button
            variant={activeTab === "permissions" ? "primary" : "ghost"}
            onClick={() => setActiveTab("permissions")}
          >
            Permissions
          </Button>
          <Button
            variant={activeTab === "subscriptions" ? "primary" : "ghost"}
            onClick={() => setActiveTab("subscriptions")}
          >
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

      {activeTab === "users" && (
        <>
          <Card
            title="User records"
            action={
              <Button variant="ghost" onClick={() => setUsersReloadKey((value) => value + 1)} disabled={usersLoading}>
                Refresh
              </Button>
            }
          >
            <p className="muted" style={{ marginBottom: 12 }}>
              This view is backed by the `ps-upload-api-prod-users` DynamoDB table through upload API admin endpoints.
            </p>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {USER_STATUSES.map((status) => (
                <Button
                  key={status}
                  variant={usersStatus === status ? "primary" : "ghost"}
                  className="button--small"
                  onClick={() => setUsersStatus(status)}
                >
                  {status}
                </Button>
              ))}
            </div>

            <label className="field" htmlFor="usersSearch" style={{ maxWidth: 420 }}>
              <span>Search current list</span>
              <input
                className="input"
                id="usersSearch"
                type="search"
                value={usersSearch}
                onChange={(event) => setUsersSearch(event.target.value)}
                placeholder="Filter by email, user ID, or organisation"
              />
            </label>

            {usersLoading ? (
              <p className="muted" style={{ marginTop: 16 }}>Loading users…</p>
            ) : displayedUsers.length === 0 ? (
              <p className="muted" style={{ marginTop: 16 }}>
                No {usersStatus.toLowerCase()} users found for the current filter.
              </p>
            ) : (
              <div className="table-wrap" style={{ marginTop: 16 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Status</th>
                      <th>Requested access</th>
                      <th>Current access</th>
                      <th>Updated</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedUsers.map((user) => {
                      const status = normalizeUserStatus(user.status);
                      return (
                        <tr key={user.userId}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{user.email || "No email"}</div>
                            <div className="muted" style={{ fontSize: 12 }}>{user.userId}</div>
                          </td>
                          <td>
                            <span className={`status-pill ${getStatusPillClass(status)}`}>{status}</span>
                          </td>
                          <td style={{ fontSize: 13 }}>
                            <div>{user.requestedOrgId || "—"}</div>
                            <div className="muted">{formatPconCodes(getRequestedPconCodes(user))}</div>
                          </td>
                          <td style={{ fontSize: 13 }}>
                            <div>{user.orgId || "—"}</div>
                            <div className="muted">{formatPconCodes(user.allowedPconCodes || [])}</div>
                          </td>
                          <td>{formatDate(user.updatedAt || user.approvedAt || user.createdAt)}</td>
                          <td>
                            <Button variant="ghost" className="button--small" onClick={() => handleSelectUser(user)}>
                              Manage
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {selectedUser && (
            <Card title="Manage selected user">
              <div className="stack" style={{ gap: 12, maxWidth: 720 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{selectedUser.email || "No email"}</div>
                  <div className="muted" style={{ fontSize: 13 }}>{selectedUser.userId}</div>
                </div>

                <div className="table-wrap">
                  <table className="table">
                    <tbody>
                      <tr>
                        <th>Status</th>
                        <td>{normalizeUserStatus(selectedUser.status)}</td>
                      </tr>
                      <tr>
                        <th>Requested organisation</th>
                        <td>{selectedUser.requestedOrgId || "—"}</td>
                      </tr>
                      <tr>
                        <th>Requested constituencies</th>
                        <td>{formatPconCodes(getRequestedPconCodes(selectedUser))}</td>
                      </tr>
                      <tr>
                        <th>Approved by</th>
                        <td>{selectedUser.approvedBy || "—"}</td>
                      </tr>
                      <tr>
                        <th>Rejected reason</th>
                        <td>{selectedUser.rejectedReason || "—"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <label className="field" htmlFor="userOrgType">
                  <span>Organisation type</span>
                  <select
                    className="input"
                    id="userOrgType"
                    value={userForm.orgType}
                    onChange={(event) => handleOrganisationTypeChange(event.target.value)}
                  >
                    <option value="ASSOCIATION">Association</option>
                    <option value="FEDERATION">Federation</option>
                  </select>
                </label>

                <label className="field" htmlFor="userOrgId">
                  <span>Organisation</span>
                  <select
                    className="input"
                    id="userOrgId"
                    value={userForm.orgId}
                    onChange={(event) => handleOrganisationChange(event.target.value)}
                    disabled={organisationsLoading}
                  >
                    <option value="">Select organisation</option>
                    {selectedOrganisationOptions.map((org) => (
                      <option key={org.orgId} value={org.orgId}>
                        {org.name}
                      </option>
                    ))}
                  </select>
                </label>

                {organisationsError && (
                  <p role="alert" style={{ margin: 0, color: "#b91c1c" }}>
                    {organisationsError}
                  </p>
                )}

                {selectedOrganisation?.pconCodes?.length > 0 && (
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                    Selected organisation covers {selectedOrganisation.pconCodes.length} constituency code(s).
                  </p>
                )}

                <label className="field" htmlFor="allowedPconCodes">
                  <span>Allowed constituency codes</span>
                  <textarea
                    className="input"
                    id="allowedPconCodes"
                    rows={4}
                    value={userForm.allowedPconCodesText}
                    onChange={(event) =>
                      setUserForm((current) => ({ ...current, allowedPconCodesText: event.target.value }))
                    }
                    placeholder="Comma or newline separated PCON24CD values"
                  />
                </label>

                <label className="field" htmlFor="rejectReason">
                  <span>Reject reason</span>
                  <textarea
                    className="input"
                    id="rejectReason"
                    rows={3}
                    value={userForm.rejectReason}
                    onChange={(event) =>
                      setUserForm((current) => ({ ...current, rejectReason: event.target.value }))
                    }
                    placeholder="Optional reason shown on the user record"
                  />
                </label>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button
                    loading={userActionId === `${selectedUser.userId}:approve`}
                    disabled={Boolean(userActionId)}
                    onClick={handleApproveSelectedUser}
                  >
                    {normalizeUserStatus(selectedUser.status) === "APPROVED" ? "Save access" : "Approve user"}
                  </Button>
                  <Button
                    variant="ghost"
                    loading={userActionId === `${selectedUser.userId}:reject`}
                    disabled={Boolean(userActionId)}
                    onClick={handleRejectSelectedUser}
                  >
                    Reject user
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </>
      )}
      {activeTab === "permissions" && (
        <>
          <Card title="Find user">
            <form className="stack" style={{ gap: 10, maxWidth: 480 }} onSubmit={handleSearch}>
              <label className="field" htmlFor="searchEmail">
                <span>User email</span>
                <input
                  className="input"
                  id="searchEmail"
                  type="email"
                  value={searchEmail}
                  onChange={(event) => setSearchEmail(event.target.value)}
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
                              <th>MP Persona Access</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activePerms.map((permission) => {
                              const locked = (permission.user_email || "").trim().toLowerCase() === ROOT_ADMIN_EMAIL;
                              const value = locked ? true : Boolean(mpPersonaFlags[permission.id]);
                              return (
                                <tr key={permission.id}>
                                  <td>{permission.associations?.name || permission.association_id}</td>
                                  <td>
                                    {permission.granted_at
                                      ? new Date(permission.granted_at).toLocaleDateString("en-GB")
                                      : "—"}
                                  </td>
                                  <td>{permission.granted_by || "—"}</td>
                                  <td>
                                    <MpPersonaToggle
                                      permission={permission}
                                      value={value}
                                      locked={locked}
                                      status={mpPersonaStatus[permission.id] || ""}
                                      onToggle={handleToggleMpPersona}
                                    />
                                  </td>
                                  <td>
                                    <Button
                                      variant="ghost"
                                      className="button--small"
                                      loading={revoking === permission.id}
                                      disabled={Boolean(revoking)}
                                      onClick={() => handleRevoke(permission)}
                                    >
                                      Revoke
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
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

          <Card title="Grant permission">
            <div className="stack" style={{ gap: 10, maxWidth: 480 }}>
              <label className="field" htmlFor="grantEmail">
                <span>User email</span>
                <input
                  className="input"
                  id="grantEmail"
                  type="email"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
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
                  onChange={(event) => setNewCognitoSub(event.target.value)}
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
                  onChange={(event) => setSelectedAssocId(event.target.value)}
                >
                  <option value="">Select an association</option>
                  {associations.map((association) => (
                    <option key={association.id} value={association.id}>
                      {association.name}
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
                        <div className="muted">
                          {subscription.stripe_subscription_id || subscription.stripe_invoice_id || "—"}
                        </div>
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
