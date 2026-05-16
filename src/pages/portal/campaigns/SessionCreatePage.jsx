import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate } from "react-router-dom";
import SessionForm from "../../../components/campaigns/SessionForm.jsx";
import { useCampaignAccess } from "../../../hooks/useCampaignAccess.js";
import { createSession, listManagedAssociations } from "../../../lib/campaignApi.js";
import "./campaigns.css";

export default function SessionCreatePage() {
  const access = useCampaignAccess();
  const navigate = useNavigate();
  const [associations, setAssociations] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);

  useEffect(() => {
    if (access.loading) return;
    if (!access.access) {
      setAccessChecked(true);
      return;
    }
    const canCreate = access.access.isAdmin || access.access.isCampaignManagerFor.size > 0;
    if (!canCreate) {
      setAccessChecked(true);
      return;
    }
    listManagedAssociations(access.access).then((list) => {
      setAssociations(list);
      setAccessChecked(true);
    });
  }, [access.loading, access.access]);

  const handleSubmit = async (input) => {
    setSubmitting(true);
    try {
      const session = await createSession(input, access.cognitoSub);
      navigate(`/portal/campaigns/${session.id}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (access.loading || !accessChecked) {
    return <div className="page stack"><p style={{ color: "var(--portal-text-muted)" }}>Loading…</p></div>;
  }

  const canCreate = access.access && (access.access.isAdmin || access.access.isCampaignManagerFor.size > 0);
  if (!canCreate) {
    return (
      <div className="page stack">
        <p>You don't have permission to create sessions. Speak to your association's Campaign Manager.</p>
      </div>
    );
  }

  return (
    <div className="page stack campaigns-page">
      <Helmet><title>Create session — Political Solutions</title></Helmet>
      <p style={{ margin: 0 }}>
        <Link to="/portal/campaigns" style={{ color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
          ← All sessions
        </Link>
      </p>
      <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--portal-text-primary)", letterSpacing: "-0.01em" }}>
        Create session
      </h1>
      <SessionForm associations={associations} onSubmit={handleSubmit} submitting={submitting} submitLabel="Create session" />
    </div>
  );
}
