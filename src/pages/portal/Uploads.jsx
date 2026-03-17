import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import { createJob, getDownloadUrls, getJob, listElections, listJobs } from "../../lib/uploadApi.js";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
const ALLOWED_EXTENSIONS = new Set([".pdf", ".csv"]);
const POLL_INTERVAL_MS = 5000;

function getFileExt(filename) {
  const lastDot = filename.lastIndexOf(".");
  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : "";
}

function validateFile(file) {
  const ext = getFileExt(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return `"${file.name}": only PDF and CSV files are accepted.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `"${file.name}": exceeds the 200 MB size limit.`;
  }
  return null;
}

function StatusBadge({ status }) {
  const styles = {
    QUEUED: { background: "#e2e8f0", color: "#475569" },
    PROCESSING: { background: "#dbeafe", color: "#1d4ed8" },
    SUCCEEDED: { background: "#dcfce7", color: "#15803d" },
    FAILED: { background: "#fee2e2", color: "#b91c1c" },
  };
  const labels = {
    QUEUED: "Queued",
    PROCESSING: "Processing",
    SUCCEEDED: "Succeeded",
    FAILED: "Failed",
  };
  const style = styles[status] || { background: "#f1f5f9", color: "#64748b" };
  return (
    <span
      style={{
        ...style,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {labels[status] || status}
    </span>
  );
}

export default function Uploads() {
  const [staged, setStaged] = useState([]);
  const [metadata, setMetadata] = useState({ clientName: "", notes: "" });
  const [submissionScope, setSubmissionScope] = useState({
    pconCode: "",
    wards: "",
    electionId: "",
    manualReviewReason: "",
  });
  const [elections, setElections] = useState([]);
  const [loadingElections, setLoadingElections] = useState(false);
  const [electionsError, setElectionsError] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const pollingRef = useRef(null);

  useEffect(() => {
    listJobs(25)
      .then((data) => setJobs(data.items || []))
      .catch((err) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    const activeJobs = jobs.filter(
      (j) => j.status === "QUEUED" || j.status === "PROCESSING"
    );
    if (activeJobs.length === 0) return undefined;

    pollingRef.current = setInterval(async () => {
      await Promise.all(
        activeJobs.map(async (job) => {
          try {
            const updated = await getJob(job.jobId);
            setJobs((prev) =>
              prev.map((j) => (j.jobId === updated.jobId ? updated : j))
            );
          } catch {
            // ignore transient poll errors
          }
        })
      );
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [jobs]);

  useEffect(() => {
    const pconCode = submissionScope.pconCode.trim().toUpperCase();
    if (!pconCode) {
      setElections([]);
      setElectionsError(null);
      setLoadingElections(false);
      setSubmissionScope((scope) => ({ ...scope, electionId: "" }));
      return undefined;
    }

    let cancelled = false;
    setLoadingElections(true);
    setElectionsError(null);
    setSubmissionScope((scope) => ({ ...scope, electionId: "" }));
    listElections(pconCode, ["OPEN", "UPCOMING"])
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setElections(items);
      })
      .catch((error) => {
        if (cancelled) return;
        setElections([]);
        setElectionsError(error.message || "Failed to load elections.");
      })
      .finally(() => {
        if (!cancelled) setLoadingElections(false);
      });

    return () => {
      cancelled = true;
    };
  }, [submissionScope.pconCode]);

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList).map((file) => ({
      file,
      error: validateFile(file),
    }));
    setStaged((prev) => [...prev, ...incoming]);
  }, []);

  const removeStaged = (index) => {
    setStaged((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleFileChange = (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  };

  const handleUpload = async () => {
    const valid = staged.filter((s) => !s.error);
    if (valid.length === 0) return;
    const pconCode = submissionScope.pconCode.trim().toUpperCase();
    if (!pconCode) {
      setUploadErrors(["Constituency code (PCON24CD) is required."]);
      return;
    }
    const electionId = submissionScope.electionId.trim();
    if (!electionId) {
      setUploadErrors(["Election selection is required."]);
      return;
    }
    if (electionId === "OTHER" && submissionScope.manualReviewReason.trim().length < 10) {
      setUploadErrors(["Manual review reason must be at least 10 characters when election is Other."]);
      return;
    }

    const wardCodes = submissionScope.wards
      .split(",")
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean);

    setUploading(true);
    setUploadErrors([]);
    const errors = [];

    for (const { file } of valid) {
      const ext = getFileExt(file.name);
      const fileType = ext === ".pdf" ? "pdf" : "csv";
      try {
        const { jobId, upload, s3Key } = await createJob({
          filename: file.name,
          pconCode,
          electionId,
          ...(electionId === "OTHER"
            ? { manualReviewReason: submissionScope.manualReviewReason.trim() }
            : {}),
          ...(wardCodes.length > 0 ? { wards: wardCodes } : {}),
          fileType,
          size: file.size,
          metadata: {
            clientName: metadata.clientName.trim(),
            notes: metadata.notes.trim(),
          },
        });
        if (!upload?.url || !upload?.fields) {
          throw new Error("Upload details were missing from API response.");
        }

        const form = new FormData();
        for (const [field, value] of Object.entries(upload.fields)) {
          form.append(field, value);
        }
        form.append("file", file);

        const postRes = await fetch(upload.url, {
          method: "POST",
          body: form,
        });
        if (!postRes.ok) {
          throw new Error(`S3 upload failed (${postRes.status}).`);
        }

        const now = new Date().toISOString();
        setJobs((prev) => [
          {
            jobId,
            filename: file.name,
            fileType,
            s3Key,
            status: "QUEUED",
            createdAt: now,
            updatedAt: now,
          },
          ...prev,
        ]);
      } catch (err) {
        errors.push(`"${file.name}": ${err.message}`);
      }
    }

    setUploading(false);
    if (errors.length > 0) {
      setUploadErrors(errors);
    } else {
      setStaged([]);
      setMetadata({ clientName: "", notes: "" });
    }
  };

  const handleDownload = async (job) => {
    try {
      const data = await getDownloadUrls(job.jobId);
      for (const { name, downloadUrl } of data.files || []) {
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch (err) {
      setUploadErrors([`Download failed: ${err.message}`]);
    }
  };

  const handleRefresh = () => {
    setLoadError(null);
    listJobs(25)
      .then((d) => setJobs(d.items || []))
      .catch((err) => setLoadError(err.message));
  };

  const validStaged = staged.filter((s) => !s.error);
  const invalidStaged = staged.filter((s) => s.error);

  return (
    <div className="page stack">
      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Marked Register Processing</span>
            <h1 className="portal-page-header__title">Uploads</h1>
            <p className="portal-page-header__subtitle">
              Upload marked register files, define the election context, and monitor processing in one place.
            </p>
          </div>
        </div>
      </Card>

      <Card title="Upload files">
        <p className="muted" style={{ marginBottom: 16 }}>
          Upload PDF or CSV files (max 200 MB each). Each file becomes a separate
          processing job.
        </p>

        <div
          className={`portal-dropzone${dragOver ? " is-active" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Drop files here or click to choose"
        >
          <p className="portal-dropzone__title">
            Drag &amp; drop PDF or CSV files here, or{" "}
            <strong style={{ color: "#2563eb" }}>click to browse</strong>
          </p>
          <p className="portal-dropzone__meta">
            Accepted: .pdf, .csv — max 200 MB per file
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.csv,application/pdf,text/csv"
            multiple
            onChange={handleFileChange}
            style={{ display: "none" }}
            aria-hidden="true"
          />
        </div>

        {staged.length > 0 && (
          <div className="stack" style={{ marginTop: 16, gap: 6 }}>
            <strong>Selected files ({staged.length}):</strong>
            <ul className="portal-file-list">
              {staged.map(({ file, error }, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="portal-file-list__item"
                  style={{ color: error ? "#b91c1c" : "inherit" }}
                >
                  <span style={{ flex: 1 }}>
                    {file.name}{" "}
                    <span className="portal-file-list__meta">
                      ({(file.size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                    {error && (
                      <span
                        style={{ display: "block", fontSize: 12, color: "#b91c1c" }}
                      >
                        {error}
                      </span>
                    )}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => removeStaged(i)}
                    className="button--small"
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            {invalidStaged.length > 0 && (
              <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>
                {invalidStaged.length} file(s) with errors will not be uploaded.
              </p>
            )}
          </div>
        )}

        {validStaged.length > 0 && (
          <div className="stack" style={{ marginTop: 20, gap: 12 }}>
            <label className="field" htmlFor="pconCode">
              <span>
                Constituency code (PCON24CD)
              </span>
              <input
                className="input"
                id="pconCode"
                type="text"
                value={submissionScope.pconCode}
                onChange={(e) =>
                  setSubmissionScope((scope) => ({ ...scope, pconCode: e.target.value }))
                }
                placeholder="e.g. E14000637"
              />
            </label>
            <label className="field" htmlFor="wardCodes">
              <span>
                Ward codes (optional, comma-separated WD24CD)
              </span>
              <input
                className="input"
                id="wardCodes"
                type="text"
                value={submissionScope.wards}
                onChange={(e) =>
                  setSubmissionScope((scope) => ({ ...scope, wards: e.target.value }))
                }
                placeholder="e.g. W1001,W1002"
              />
            </label>
            <div className="field">
              <label htmlFor="electionId">
                Election
              </label>
              <select
                className="input"
                id="electionId"
                value={submissionScope.electionId}
                onChange={(e) =>
                  setSubmissionScope((scope) => ({
                    ...scope,
                    electionId: e.target.value,
                    manualReviewReason: e.target.value === "OTHER" ? scope.manualReviewReason : "",
                  }))
                }
                disabled={!submissionScope.pconCode.trim() || loadingElections}
              >
                <option value="">Select an election</option>
                {elections.map((election) => (
                  <option key={election.electionId} value={election.electionId}>
                    {election.name} ({election.date})
                  </option>
                ))}
                {elections.length === 0 && !loadingElections && submissionScope.pconCode.trim() && (
                  <option value="OTHER">Other / Not listed</option>
                )}
              </select>
              {loadingElections && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>
                  Loading elections...
                </p>
              )}
              {!loadingElections && elections.length === 0 && submissionScope.pconCode.trim() && !electionsError && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#b45309" }}>
                  No elections configured for this constituency.
                </p>
              )}
              {electionsError && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#b91c1c" }}>
                  {electionsError}
                </p>
              )}
            </div>
            {submissionScope.electionId === "OTHER" && (
              <label className="field" htmlFor="manualReviewReason">
                <span>
                  Manual review reason
                </span>
                <textarea
                  className="input"
                  id="manualReviewReason"
                  rows={3}
                  value={submissionScope.manualReviewReason}
                  onChange={(e) =>
                    setSubmissionScope((scope) => ({ ...scope, manualReviewReason: e.target.value }))
                  }
                  placeholder="Explain why this election is not listed (minimum 10 characters)."
                />
              </label>
            )}
            <label className="field" htmlFor="clientName">
              <span>
                Client name (optional)
              </span>
              <input
                className="input"
                id="clientName"
                type="text"
                value={metadata.clientName}
                onChange={(e) =>
                  setMetadata((m) => ({ ...m, clientName: e.target.value }))
                }
                placeholder="e.g. North Association"
              />
            </label>
            <label className="field" htmlFor="notes">
              <span>
                Notes (optional)
              </span>
              <textarea
                className="input"
                id="notes"
                rows={3}
                value={metadata.notes}
                onChange={(e) =>
                  setMetadata((m) => ({ ...m, notes: e.target.value }))
                }
                placeholder="Any additional notes about this batch"
              />
            </label>
            <Button
              onClick={handleUpload}
              loading={uploading}
              disabled={
                uploading ||
                (submissionScope.electionId === "OTHER" &&
                  submissionScope.manualReviewReason.trim().length < 10)
              }
            >
              {uploading
                ? "Uploading…"
                : `Upload ${validStaged.length} file${validStaged.length !== 1 ? "s" : ""}`}
            </Button>
          </div>
        )}

        {uploadErrors.length > 0 && (
          <div className="status error" style={{ marginTop: 12, display: "block" }}>
            <strong>Errors:</strong>
            <ul className="portal-error-list">
              {uploadErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card
        title="Processing jobs"
        action={
          <Button type="button" variant="ghost" className="button--small" onClick={handleRefresh}>
            Refresh
          </Button>
        }
      >
        {loadError && (
          <p style={{ color: "#b91c1c", margin: 0 }}>{loadError}</p>
        )}
        {jobs.length === 0 && !loadError && (
          <p className="muted" style={{ margin: 0 }}>
            No jobs yet. Upload files above to get started.
          </p>
        )}
        {jobs.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.jobId}>
                    <td title={job.jobId}>
                      {job.filename}
                    </td>
                    <td>
                      {job.fileType?.toUpperCase()}
                    </td>
                    <td>
                      <StatusBadge status={job.status} />
                    </td>
                    <td>
                      {job.createdAt
                        ? new Date(job.createdAt).toLocaleString()
                        : "—"}
                    </td>
                    <td>
                      {job.updatedAt
                        ? new Date(job.updatedAt).toLocaleString()
                        : "—"}
                    </td>
                    <td>
                      <div className="portal-section-actions">
                        {job.status === "SUCCEEDED" && (
                          <Button
                            variant="secondary"
                            className="button--small"
                            onClick={() => handleDownload(job)}
                          >
                            Download
                          </Button>
                        )}
                        {job.status === "FAILED" && job.error?.message && (
                          <span
                            style={{ color: "#b91c1c", fontSize: 12 }}
                            title={job.error?.detail}
                          >
                            {job.error.message}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
