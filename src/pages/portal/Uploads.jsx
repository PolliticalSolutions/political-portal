import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import { createJob, listJobs } from "../../lib/uploadApi.js";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
const ALLOWED_EXTENSIONS = new Set([".pdf", ".csv"]);
const POLL_INTERVAL_MS = 30000;
const PENDING_JOB_STATUSES = new Set(["PENDING", "QUEUED", "CREATED", "RECEIVED"]);
const PROCESSING_JOB_STATUSES = new Set(["PROCESSING", "RUNNING"]);
const COMPLETE_JOB_STATUSES = new Set(["SUCCEEDED", "COMPLETE", "COMPLETED"]);
const FAILED_JOB_STATUSES = new Set(["FAILED", "ERROR"]);

const EMPTY_FORM = {
  association: "",
  constituency: "",
  councilArea: "",
  election: "",
  electionDate: "",
};

function getFileExt(filename) {
  const lastDot = filename.lastIndexOf(".");
  return lastDot >= 0 ? filename.slice(lastDot).toLowerCase() : "";
}

function normalizeJobStatus(status) {
  return (status || "").toString().trim().toUpperCase();
}

function isActiveJobStatus(status) {
  const normalized = normalizeJobStatus(status);
  return PENDING_JOB_STATUSES.has(normalized) || PROCESSING_JOB_STATUSES.has(normalized);
}

function getStatusPresentation(status) {
  const normalized = normalizeJobStatus(status);

  if (PROCESSING_JOB_STATUSES.has(normalized)) {
    return {
      label: "Processing",
      description: "Processing now — large batches may take several hours. You will receive an email when complete.",
      style: { background: "#dbeafe", color: "var(--color-navy-mid)" },
    };
  }

  if (COMPLETE_JOB_STATUSES.has(normalized)) {
    return { label: "Complete", description: null, style: { background: "#dcfce7", color: "var(--color-cta)" } };
  }

  if (FAILED_JOB_STATUSES.has(normalized)) {
    return {
      label: "Failed",
      description: "Processing encountered an issue. Our team has been notified.",
      style: { background: "#fee2e2", color: "var(--color-danger)" },
    };
  }

  return {
    label: PENDING_JOB_STATUSES.has(normalized) || !normalized ? "Pending" : normalized,
    description: PENDING_JOB_STATUSES.has(normalized)
      ? "Queued for processing — you will receive an email when complete. Large batches may take several hours."
      : null,
    style: PENDING_JOB_STATUSES.has(normalized)
      ? { background: "var(--color-border)", color: "var(--color-text-secondary)" }
      : { background: "#f1f5f9", color: "var(--color-text-muted)" },
  };
}

function validateFile(file) {
  const ext = getFileExt(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) return `"${file.name}": only PDF and CSV files are accepted.`;
  if (file.size > MAX_FILE_SIZE) return `"${file.name}": exceeds the 200 MB size limit.`;
  return null;
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const p = getStatusPresentation(status);
  return (
    <div>
      <span style={{ ...p.style, padding: "2px 8px", borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
        {p.label}
      </span>
      {p.description && (
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4, maxWidth: 320 }}>{p.description}</div>
      )}
    </div>
  );
}

// ── Confirmation Modal ────────────────────────────────────────────────────────

function ConfirmUploadModal({ form, files, onConfirm, onBack }) {
  const rows = [
    ["Association / Federation", form.association],
    ["Constituency", form.constituency],
    ["Council Area", form.councilArea],
    ["Election", form.election],
    ["Date of Election", form.electionDate],
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)" }}
        onClick={onBack}
        aria-hidden="true"
      />
      <div
        style={{
          position: "relative",
          background: "white",
          borderRadius: 12,
          padding: 28,
          maxWidth: 540,
          width: "100%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
      >
        <h2 id="confirm-modal-title" style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>
          Confirm upload
        </h2>

        <dl style={{ margin: "0 0 16px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px" }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: "contents" }}>
              <dt style={{ fontWeight: 600, color: "var(--color-text-secondary)", fontSize: 14 }}>{label}</dt>
              <dd style={{ margin: 0, fontSize: 14 }}>{value}</dd>
            </div>
          ))}
          <dt style={{ fontWeight: 600, color: "var(--color-text-secondary)", fontSize: 14 }}>Files</dt>
          <dd style={{ margin: 0, fontSize: 14 }}>{files.length} file{files.length !== 1 ? "s" : ""}</dd>
        </dl>

        <ul
          style={{
            margin: "0 0 20px",
            padding: "10px 14px",
            background: "#f8fafc",
            borderRadius: 8,
            listStyle: "none",
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {files.map((f) => (
            <li
              key={f.name}
              style={{ fontSize: 13, padding: "2px 0", color: "var(--color-text-primary)", borderBottom: "1px solid var(--color-border)" }}
            >
              {f.name}
              <span style={{ marginLeft: 8, color: "var(--color-text-muted)", fontSize: 11 }}>
                ({(f.size / 1024 / 1024).toFixed(1)} MB)
              </span>
            </li>
          ))}
        </ul>

        <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--color-text-muted)" }}>
          Once confirmed, this batch is sealed — no further files can be added. Proceed?
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button type="button" variant="ghost" onClick={onBack}>
            Go Back
          </Button>
          <Button type="button" onClick={onConfirm}>
            Confirm and Upload
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Uploads() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [staged, setStaged] = useState([]);

  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState("");

  const [jobs, setJobs] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef(null);
  const pollingRef = useRef(null);

  // ── Load jobs ───────────────────────────────────────────────────────────────
  const loadJobs = useCallback(() => {
    setLoadError(null);
    return listJobs(25)
      .then((data) => setJobs(data.items || []))
      .catch((err) => setLoadError(err.message));
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  // ── Poll active jobs ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (!jobs.some((j) => isActiveJobStatus(j.status))) return undefined;
    pollingRef.current = setInterval(loadJobs, POLL_INTERVAL_MS);
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [jobs, loadJobs]);

  // ── File handling ────────────────────────────────────────────────────────────
  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList).map((file) => ({ file, error: validateFile(file) }));
    setStaged((prev) => [...prev, ...incoming]);
  }, []);

  const removeStaged = (index) => setStaged((prev) => prev.filter((_, i) => i !== index));

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const handleFileChange = (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  };

  const handleField = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // ── Open confirm modal ───────────────────────────────────────────────────────
  const handleUploadClick = () => {
    const valid = staged.filter((s) => !s.error);
    if (valid.length === 0) return;

    const errors = [];
    if (!form.association.trim()) errors.push("Association / Federation is required.");
    if (!form.constituency.trim()) errors.push("Constituency is required.");
    if (!form.councilArea.trim()) errors.push("Council Area is required.");
    if (!form.election.trim()) errors.push("Election is required.");
    if (!form.electionDate.trim()) errors.push("Date of Election is required.");
    if (errors.length > 0) { setUploadErrors(errors); return; }

    setUploadErrors([]);
    setConfirmModalOpen(true);
  };

  // ── Confirmed upload — batchId sealed here ───────────────────────────────────
  const handleConfirm = async () => {
    setConfirmModalOpen(false);

    const batchId = crypto.randomUUID();
    const valid = staged.filter((s) => !s.error);
    const totalFilesInBatch = valid.length;

    const trimmed = {
      association: form.association.trim(),
      constituency: form.constituency.trim(),
      councilArea: form.councilArea.trim(),
      election: form.election.trim(),
      electionDate: form.electionDate.trim(),
    };

    setUploading(true);
    setUploadErrors([]);
    setUploadSuccessMessage("");

    const errors = [];
    const successfulFiles = new Set();
    let uploadedCount = 0;

    for (const { file } of valid) {
      const ext = getFileExt(file.name);
      const fileType = ext === ".pdf" ? "pdf" : "csv";
      try {
        const { jobId, upload, s3Key } = await createJob({
          filename: file.name,
          batchId,
          totalFilesInBatch,
          ...trimmed,
          fileType,
          size: file.size,
        });

        if (!upload?.url || !upload?.fields) {
          throw new Error("Upload details were missing from API response.");
        }

        const formData = new FormData();
        for (const [field, value] of Object.entries(upload.fields)) {
          formData.append(field, value);
        }
        formData.append("file", file);

        const postRes = await fetch(upload.url, { method: "POST", body: formData });
        if (!postRes.ok) throw new Error(`S3 upload failed (${postRes.status}).`);

        const now = new Date().toISOString();
        setJobs((prev) => [
          { jobId, filename: file.name, fileType, s3Key, status: "QUEUED", createdAt: now, updatedAt: now },
          ...prev,
        ]);
        successfulFiles.add(file);
        uploadedCount += 1;
      } catch (err) {
        errors.push(`"${file.name}": ${err.message}`);
      }
    }

    setUploading(false);

    if (uploadedCount > 0) {
      setUploadSuccessMessage(
        `${uploadedCount} file${uploadedCount !== 1 ? "s" : ""} submitted. You will receive an email when processing is complete.`
      );
      setStaged((prev) => prev.filter(({ file, error }) => error || !successfulFiles.has(file)));
      if (valid.length === uploadedCount) {
        setForm(EMPTY_FORM);
      }
    }
    if (errors.length > 0) setUploadErrors(errors);
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const validStaged = staged.filter((s) => !s.error);
  const invalidStaged = staged.filter((s) => s.error);

  const allFieldsFilled =
    form.association.trim() &&
    form.constituency.trim() &&
    form.councilArea.trim() &&
    form.election.trim() &&
    form.electionDate.trim();

  const canUpload = !uploading && validStaged.length > 0 && allFieldsFilled;

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="page stack">
      <Helmet><title>Data Uploads | Political Solutions</title></Helmet>

      <Card>
        <div className="portal-page-header">
          <div className="portal-page-header__content">
            <span className="portal-page-header__eyebrow">Marked Register Processing</span>
            <h1 className="portal-page-header__title">Uploads</h1>
            <p className="portal-page-header__subtitle">
              Enter the batch details, then upload your Marked Register PDFs. We will process them
              and email you the results.
            </p>
          </div>
        </div>
      </Card>

      <Card title="Upload files">
        {uploadSuccessMessage && (
          <div className="status success" role="status" style={{ marginBottom: 16 }}>
            {uploadSuccessMessage}
          </div>
        )}

        <div className="stack" style={{ gap: 16 }}>
          {/* ── Step 1: Batch details ── */}
          <div>
            <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 14 }}>
              <strong>Step 1:</strong> Batch details
            </p>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--color-text-muted)" }}>
              All five fields are mandatory and appear in the output CSV filename.
            </p>
            <div className="stack" style={{ gap: 12 }}>
              <label className="field" htmlFor="association">
                <span>Association / Federation</span>
                <input
                  className="input"
                  id="association"
                  type="text"
                  value={form.association}
                  onChange={handleField("association")}
                  placeholder="e.g. Staffordshire South Conservative Association"
                  required
                />
              </label>
              <label className="field" htmlFor="constituency">
                <span>Constituency</span>
                <input
                  className="input"
                  id="constituency"
                  type="text"
                  value={form.constituency}
                  onChange={handleField("constituency")}
                  placeholder="e.g. Stone, Great Wyrley and Penkridge"
                  required
                />
              </label>
              <label className="field" htmlFor="councilArea">
                <span>Council Area</span>
                <input
                  className="input"
                  id="councilArea"
                  type="text"
                  value={form.councilArea}
                  onChange={handleField("councilArea")}
                  placeholder="e.g. South Staffordshire District Council"
                  required
                />
              </label>
              <label className="field" htmlFor="election">
                <span>Election</span>
                <input
                  className="input"
                  id="election"
                  type="text"
                  value={form.election}
                  onChange={handleField("election")}
                  placeholder="e.g. 2024 General Election"
                  required
                />
              </label>
              <label className="field" htmlFor="electionDate">
                <span>Date of Election</span>
                <input
                  className="input"
                  id="electionDate"
                  type="text"
                  value={form.electionDate}
                  onChange={handleField("electionDate")}
                  placeholder="e.g. 04 July 2024"
                  required
                />
              </label>
            </div>
          </div>

          {/* ── Step 2: Files ── */}
          <div>
            <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 14 }}>
              <strong>Step 2:</strong> Add files
            </p>
            <div
              className={`portal-dropzone${dragOver ? " is-active" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
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
                <strong style={{ color: "var(--color-navy-mid)" }}>click to browse</strong>
              </p>
              <p className="portal-dropzone__meta">Accepted: .pdf, .csv — max 200 MB per file</p>
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
          </div>

          {staged.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <strong>Selected files ({staged.length}):</strong>
              <ul className="portal-file-list">
                {staged.map(({ file, error }, i) => (
                  <li
                    key={`${file.name}-${i}`}
                    className="portal-file-list__item"
                    style={{ color: error ? "var(--color-danger)" : "inherit" }}
                  >
                    <span style={{ flex: 1 }}>
                      {file.name}{" "}
                      <span className="portal-file-list__meta">
                        ({(file.size / 1024 / 1024).toFixed(1)} MB)
                      </span>
                      {error && (
                        <span style={{ display: "block", fontSize: 12, color: "var(--color-danger)" }}>{error}</span>
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
                <p style={{ margin: 0, fontSize: 13, color: "var(--color-danger)" }}>
                  {invalidStaged.length} file(s) with errors will not be uploaded.
                </p>
              )}
            </div>
          )}

          {validStaged.length > 0 && (
            <Button
              onClick={handleUploadClick}
              loading={uploading}
              disabled={!canUpload}
            >
              {uploading
                ? "Uploading…"
                : `Review and upload ${validStaged.length} file${validStaged.length !== 1 ? "s" : ""}`}
            </Button>
          )}

          {uploadErrors.length > 0 && (
            <div className="status error" style={{ display: "block" }}>
              <strong>Errors:</strong>
              <ul className="portal-error-list">
                {uploadErrors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          )}
        </div>
      </Card>

      <Card
        title="Processing jobs"
        action={
          <Button type="button" variant="ghost" className="button--small" onClick={loadJobs}>
            Refresh
          </Button>
        }
      >
        {loadError && <p style={{ color: "var(--color-danger)", margin: 0 }}>{loadError}</p>}
        {jobs.length === 0 && !loadError && (
          <p className="muted" style={{ margin: 0 }}>No jobs yet. Upload files above to get started.</p>
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
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.jobId}>
                    <td title={job.jobId}>{job.filename}</td>
                    <td>{job.fileType?.toUpperCase()}</td>
                    <td><StatusBadge status={job.status} /></td>
                    <td>{job.createdAt ? new Date(job.createdAt).toLocaleString() : "—"}</td>
                    <td>{job.updatedAt ? new Date(job.updatedAt).toLocaleString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {confirmModalOpen && (
        <ConfirmUploadModal
          form={form}
          files={validStaged.map((s) => s.file)}
          onConfirm={handleConfirm}
          onBack={() => setConfirmModalOpen(false)}
        />
      )}
    </div>
  );
}
