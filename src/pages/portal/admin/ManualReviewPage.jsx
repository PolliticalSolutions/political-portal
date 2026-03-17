import { useEffect, useMemo, useState } from "react";
import Button from "../../../components/Button.jsx";
import Card from "../../../components/Card.jsx";
import {
  getManualReviewJob,
  listManualReviewJobs,
  resolveManualReviewJob,
} from "../../../lib/uploadApi.js";

export default function ManualReviewPage() {
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);
  const [decision, setDecision] = useState("APPROVE");
  const [note, setNote] = useState("");
  const [correctedElectionId, setCorrectedElectionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState("");

  const selectedSummary = useMemo(
    () => jobs.find((job) => job.jobId === selectedJobId) || null,
    [jobs, selectedJobId]
  );

  async function refreshList() {
    const result = await listManualReviewJobs({ status: "OPEN", limit: 50 });
    setJobs(Array.isArray(result?.items) ? result.items : []);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    refreshList()
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load manual review queue.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedJobId) {
      setSelectedJob(null);
      return;
    }
    let cancelled = false;
    getManualReviewJob(selectedJobId)
      .then((result) => {
        if (!cancelled) setSelectedJob(result?.job || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load job detail.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedJobId]);

  const handleResolve = async () => {
    setError("");
    setBanner("");
    if (note.trim().length < 10) {
      setError("Review note must be at least 10 characters.");
      return;
    }
    if (!selectedJobId) {
      setError("Select a job first.");
      return;
    }

    setSaving(true);
    try {
      await resolveManualReviewJob(selectedJobId, {
        decision,
        note: note.trim(),
        ...(correctedElectionId.trim() ? { correctedElectionId: correctedElectionId.trim() } : {}),
      });
      await refreshList();
      setBanner("Manual review decision saved.");
      setSelectedJobId("");
      setSelectedJob(null);
      setNote("");
      setCorrectedElectionId("");
      setDecision("APPROVE");
    } catch (err) {
      setError(err.message || "Failed to resolve manual review.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Admin</span>
            <h1 className="portal-page-header__title">Manual review</h1>
            <p className="portal-page-header__subtitle">
              Review upload exceptions, confirm election context, and record the decision cleanly.
            </p>
          </div>
        </div>
      </Card>

      <Card title="Manual review queue">
        {loading && <p className="muted">Loading manual review jobs...</p>}
        {!loading && jobs.length === 0 && <p className="muted">No open manual review jobs.</p>}
        {error && (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        )}
        {banner && (
          <p role="status" className="status">
            {banner}
          </p>
        )}
        {jobs.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Org</th>
                  <th>PCON</th>
                  <th>Election</th>
                  <th>Reason</th>
                  <th>Job ID</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.jobId}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelectedJobId(job.jobId)}
                  >
                    <td>{new Date(job.createdAt).toLocaleString()}</td>
                    <td>{job.orgId || "—"}</td>
                    <td>{job.pconCode || "—"}</td>
                    <td>{job.electionId || "—"}</td>
                    <td>{(job.manualReviewReason || "").slice(0, 80)}</td>
                    <td style={{ fontFamily: "monospace" }}>{job.jobId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(selectedSummary || selectedJob) && (
        <Card title="Review detail">
          <p>
            <strong>Job ID:</strong> {selectedSummary?.jobId || selectedJob?.jobId}
          </p>
          <p>
            <strong>User:</strong> {selectedJob?.userId || selectedSummary?.userId || "—"}
          </p>
          <p>
            <strong>Organisation:</strong> {selectedJob?.orgId || selectedSummary?.orgId || "—"}
          </p>
          <p>
            <strong>PCON:</strong> {selectedJob?.pconCode || selectedSummary?.pconCode || "—"}
          </p>
          <p>
            <strong>Election:</strong> {selectedJob?.electionId || selectedSummary?.electionId || "—"}
          </p>
          <p>
            <strong>Wards:</strong>{" "}
            {Array.isArray(selectedJob?.wardCodes) && selectedJob.wardCodes.length > 0
              ? selectedJob.wardCodes.join(", ")
              : "—"}
          </p>
          <p>
            <strong>Reason:</strong> {selectedJob?.manualReviewReason || selectedSummary?.manualReviewReason || "—"}
          </p>

          <label className="field" htmlFor="reviewDecision" style={{ marginTop: 12 }}>
            <span>Decision</span>
            <select className="input" id="reviewDecision" value={decision} onChange={(e) => setDecision(e.target.value)}>
              <option value="APPROVE">Approve</option>
              <option value="REJECT">Reject</option>
              <option value="NEEDS_INFO">Needs info</option>
            </select>
          </label>

          {decision === "APPROVE" && (
            <label className="field" htmlFor="correctedElectionId" style={{ marginTop: 12 }}>
              <span>Corrected election ID (optional)</span>
              <input
                className="input"
                id="correctedElectionId"
                type="text"
                value={correctedElectionId}
                onChange={(e) => setCorrectedElectionId(e.target.value)}
                placeholder="election id"
              />
            </label>
          )}

          <label className="field" htmlFor="reviewNote" style={{ marginTop: 12 }}>
            <span>Note (required, min 10 chars)</span>
            <textarea
              className="input"
              id="reviewNote"
              rows={4}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Enter manual review decision context"
            />
          </label>

          <div style={{ marginTop: 12 }}>
            <Button
              onClick={handleResolve}
              loading={saving}
              disabled={saving || note.trim().length < 10}
            >
              Save decision
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
