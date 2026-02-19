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
      <Card title="Manual review queue">
        {loading && <p className="muted">Loading manual review jobs...</p>}
        {!loading && jobs.length === 0 && <p className="muted">No open manual review jobs.</p>}
        {error && (
          <p role="alert" style={{ color: "#b91c1c" }}>
            {error}
          </p>
        )}
        {banner && (
          <p role="status" style={{ color: "#15803d" }}>
            {banner}
          </p>
        )}
        {jobs.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Created</th>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Org</th>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>PCON</th>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Election</th>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Reason</th>
                  <th style={{ textAlign: "left", padding: "8px 12px" }}>Job ID</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr
                    key={job.jobId}
                    style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer" }}
                    onClick={() => setSelectedJobId(job.jobId)}
                  >
                    <td style={{ padding: "8px 12px" }}>{new Date(job.createdAt).toLocaleString()}</td>
                    <td style={{ padding: "8px 12px" }}>{job.orgId || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>{job.pconCode || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>{job.electionId || "—"}</td>
                    <td style={{ padding: "8px 12px" }}>{(job.manualReviewReason || "").slice(0, 80)}</td>
                    <td style={{ padding: "8px 12px", fontFamily: "monospace" }}>{job.jobId}</td>
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

          <label htmlFor="reviewDecision" style={{ fontWeight: 600, display: "block", marginTop: 12 }}>
            Decision
          </label>
          <select id="reviewDecision" value={decision} onChange={(e) => setDecision(e.target.value)}>
            <option value="APPROVE">Approve</option>
            <option value="REJECT">Reject</option>
            <option value="NEEDS_INFO">Needs info</option>
          </select>

          {decision === "APPROVE" && (
            <>
              <label htmlFor="correctedElectionId" style={{ fontWeight: 600, display: "block", marginTop: 12 }}>
                Corrected election ID (optional)
              </label>
              <input
                id="correctedElectionId"
                type="text"
                value={correctedElectionId}
                onChange={(e) => setCorrectedElectionId(e.target.value)}
                placeholder="election id"
              />
            </>
          )}

          <label htmlFor="reviewNote" style={{ fontWeight: 600, display: "block", marginTop: 12 }}>
            Note (required, min 10 chars)
          </label>
          <textarea
            id="reviewNote"
            rows={4}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Enter manual review decision context"
          />

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
