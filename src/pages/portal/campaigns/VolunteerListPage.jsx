import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import { useCampaignAccess } from "../../../hooks/useCampaignAccess.js";
import { listManagedAssociations, listVolunteersForAssociation, approveVolunteer, rejectVolunteer } from "../../../lib/campaignApi.js";
import { supabase } from "../../../lib/supabaseClient.js";
import "./campaigns.css";

export default function VolunteerListPage() {
  const access = useCampaignAccess();
  const [associations, setAssociations] = useState([]);
  const [selectedAssociation, setSelectedAssociation] = useState("");
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (access.loading || !access.access) return;
    listManagedAssociations(access.access).then((list) => {
      setAssociations(list);
      if (list.length === 1) setSelectedAssociation(list[0].id);
    });
  }, [access.loading, access.access]);

  const refresh = async (associationId) => {
    setLoading(true);
    setError("");
    try {
      const [pendingList, approvedList] = await Promise.all([
        listVolunteersForAssociation(associationId, "pending"),
        listVolunteersForAssociation(associationId, "approved"),
      ]);
      // Also include volunteers whose region matches the association's region
      // (per the brief — coordinators see volunteers in their geography even if
      // they didn't pick the association preference).
      const { data: assoc } = await supabase
        .from("associations")
        .select("region")
        .eq("id", associationId)
        .maybeSingle();
      let extra = [];
      if (assoc && assoc.region) {
        const { data } = await supabase
          .from("volunteers")
          .select("id, first_name, last_name, email, phone, postcode, region, status, membership_number, membership_verified, association_preference, heard_via, email_opt_out, created_at, approved_at")
          .eq("region", assoc.region)
          .is("association_preference", null);
        extra = data || [];
      }
      const seen = new Set();
      const dedup = (arr) => arr.filter((v) => {
        if (seen.has(v.id)) return false;
        seen.add(v.id);
        return true;
      });
      const pendingAll = dedup([...pendingList, ...extra.filter((v) => v.status === "pending")]);
      const approvedAll = dedup([...approvedList, ...extra.filter((v) => v.status === "approved")]);
      setPending(pendingAll);
      setApproved(approvedAll);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedAssociation) refresh(selectedAssociation);
    else { setPending([]); setApproved([]); }
  }, [selectedAssociation]);

  const isCoordinator = access.access && (access.access.isAdmin || (selectedAssociation && access.access.isCoordinatorFor.has(selectedAssociation)));

  const handleApprove = async (id) => {
    await approveVolunteer(id, access.cognitoSub, "Approved via portal");
    refresh(selectedAssociation);
  };
  const handleReject = async (id) => {
    await rejectVolunteer(id, access.cognitoSub, "Rejected via portal");
    refresh(selectedAssociation);
  };

  if (access.loading) return <div className="page stack"><p style={{ color: "var(--portal-text-muted)" }}>Loading…</p></div>;
  const hasAnyAccess = access.access && (access.access.isAdmin || access.access.isCampaignManagerFor.size > 0 || access.access.isCoordinatorFor.size > 0);
  if (!hasAnyAccess) {
    return <div className="page stack"><p>You don't have permission to view volunteers.</p></div>;
  }

  return (
    <div className="page stack campaigns-page">
      <Helmet><title>Volunteers — Political Solutions</title></Helmet>
      <header>
        <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--portal-text-primary)", letterSpacing: "-0.01em" }}>
          Volunteers
        </h1>
        <p style={{ margin: "4px 0 0 0", color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
          {isCoordinator
            ? "Review pending sign-ups and manage your approved volunteer list."
            : "View the approved volunteer list for your association."}
        </p>
      </header>

      <div className="campaigns-form-row" style={{ maxWidth: 480 }}>
        <label htmlFor="association">Association</label>
        <select id="association" value={selectedAssociation} onChange={(e) => setSelectedAssociation(e.target.value)}>
          <option value="">Choose an association</option>
          {associations.map((a) => <option key={a.id} value={a.id}>{a.name}{a.region ? ` — ${a.region}` : ""}</option>)}
        </select>
      </div>

      {error && <p role="alert" style={{ color: "var(--portal-danger)" }}>{error}</p>}
      {loading && <p style={{ color: "var(--portal-text-muted)" }}>Loading…</p>}

      {selectedAssociation && !loading && (
        <>
          {isCoordinator && (
            <Section title={`Pending review (${pending.length})`} emptyHint="No pending volunteers. New sign-ups appear here for approval.">
              <VolunteerTable
                volunteers={pending}
                showActions={isCoordinator}
                onApprove={handleApprove}
                onReject={handleReject}
              />
            </Section>
          )}

          <Section title={`Approved (${approved.length})`} emptyHint="No approved volunteers yet for this association.">
            <VolunteerTable volunteers={approved} />
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, emptyHint, children }) {
  const hasContent = children && children.props && children.props.volunteers && children.props.volunteers.length > 0;
  return (
    <section style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 4, padding: "var(--space-5)" }}>
      <h2 style={{ margin: 0, fontSize: "var(--text-lg)", fontWeight: 600, color: "var(--portal-text-primary)" }}>{title}</h2>
      {!hasContent ? (
        <p style={{ marginTop: "var(--space-3)", color: "var(--portal-text-muted)" }}>{emptyHint}</p>
      ) : (
        <div style={{ marginTop: "var(--space-3)" }}>{children}</div>
      )}
    </section>
  );
}

function VolunteerTable({ volunteers, showActions, onApprove, onReject }) {
  if (!volunteers || volunteers.length === 0) return null;
  return (
    <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th align="left">Name</th>
          <th align="left">Email</th>
          <th align="left">Postcode</th>
          <th align="left">Membership</th>
          <th align="left">Joined</th>
          {showActions && <th align="left">Actions</th>}
        </tr>
      </thead>
      <tbody>
        {volunteers.map((v) => (
          <tr key={v.id}>
            <td>
              <Link to={`/portal/campaigns/volunteers/${v.id}`} style={{ color: "var(--portal-text-primary)" }}>
                {v.first_name} {v.last_name}
              </Link>
            </td>
            <td>{v.email}</td>
            <td>{v.postcode}</td>
            <td>
              {v.membership_number ? (
                <span style={{ color: v.membership_verified ? "var(--portal-success)" : "var(--portal-warning)" }}>
                  {v.membership_number} {v.membership_verified ? "✓" : "?"}
                </span>
              ) : (
                <span style={{ color: "var(--portal-text-muted)" }}>—</span>
              )}
            </td>
            <td>{new Date(v.created_at).toLocaleDateString("en-GB")}</td>
            {showActions && (
              <td>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <Button variant="primary" onClick={() => onApprove(v.id)}>Approve</Button>
                  <Button variant="secondary" onClick={() => onReject(v.id)}>Reject</Button>
                </div>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
