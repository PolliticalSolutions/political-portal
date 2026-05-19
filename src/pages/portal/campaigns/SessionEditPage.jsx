import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useNavigate, useParams } from "react-router-dom";
import SessionForm from "../../../components/campaigns/SessionForm.jsx";
import { useCampaignAccess } from "../../../hooks/useCampaignAccess.js";
import { getSessionById, listManagedAssociations, updateSession } from "../../../lib/campaignApi.js";
import "./campaigns.css";

export default function SessionEditPage() {
  const { sessionId } = useParams();
  const access = useCampaignAccess();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [associations, setAssociations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (access.loading) return;
    let cancelled = false;
    Promise.all([
      getSessionById(sessionId),
      listManagedAssociations(access.access || { isAdmin: false, isCampaignManagerFor: new Set(), isCoordinatorFor: new Set() }),
    ])
      .then(([s, list]) => {
        if (cancelled) return;
        setSession(s);
        setAssociations(list);
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId, access.loading, access.access]);

  const handleSubmit = async (input) => {
    setSubmitting(true);
    try {
      await updateSession(sessionId, input);
      navigate(`/portal/campaigns/${sessionId}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="page stack"><p style={{ color: "var(--portal-text-muted)" }}>Loading…</p></div>;
  if (error) return <div className="page stack"><p role="alert" style={{ color: "var(--portal-danger)" }}>{error}</p></div>;
  if (!session) return <div className="page stack"><p>Session not found.</p></div>;

  const isOwner = access.cognitoSub && session.created_by_sub === access.cognitoSub;
  const isAdmin = access.access && access.access.isAdmin;
  if (!isOwner && !isAdmin) {
    return <div className="page stack"><p>You can only edit sessions you created.</p></div>;
  }

  // Convert numeric fields back to string so HTML inputs render correctly.
  const initial = {
    ...session,
    duration_minutes: session.duration_minutes != null ? String(session.duration_minutes) : "",
    max_capacity: session.max_capacity != null ? String(session.max_capacity) : "",
    notes: session.notes || "",
  };

  return (
    <div className="page stack campaigns-page">
      <Helmet><title>Edit session — Political Solutions</title></Helmet>
      <p style={{ margin: 0 }}>
        <Link to={`/portal/campaigns/${sessionId}`} style={{ color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
          ← Back to session
        </Link>
      </p>
      <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--portal-text-primary)", letterSpacing: "-0.01em" }}>
        Edit session
      </h1>
      <SessionForm initial={initial} associations={associations} onSubmit={handleSubmit} submitting={submitting} submitLabel="Save changes" />
    </div>
  );
}
