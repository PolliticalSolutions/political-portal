import { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import { createJob, getDownloadUrls, listElections, listJobs } from "../../lib/uploadApi.js";
import { usePermissions } from "../../context/PermissionsContext.jsx";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
const ALLOWED_EXTENSIONS = new Set([".pdf", ".csv"]);
const POLL_INTERVAL_MS = 30000;
const PENDING_JOB_STATUSES = new Set(["PENDING", "QUEUED", "CREATED", "RECEIVED"]);
const PROCESSING_JOB_STATUSES = new Set(["PROCESSING", "RUNNING"]);
const COMPLETE_JOB_STATUSES = new Set(["SUCCEEDED", "COMPLETE", "COMPLETED"]);
const FAILED_JOB_STATUSES = new Set(["FAILED", "ERROR"]);

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

function isCompleteJobStatus(status) {
  return COMPLETE_JOB_STATUSES.has(normalizeJobStatus(status));
}

function isFailedJobStatus(status) {
  return FAILED_JOB_STATUSES.has(normalizeJobStatus(status));
}

function getStatusPresentation(status) {
  const normalized = normalizeJobStatus(status);

  if (PROCESSING_JOB_STATUSES.has(normalized)) {
    return {
      label: "Processing",
      style: { background: "#dbeafe", color: "#1d4ed8" },
    };
  }

  if (COMPLETE_JOB_STATUSES.has(normalized)) {
    return {
      label: "Complete",
      style: { background: "#dcfce7", color: "#15803d" },
    };
  }

  if (FAILED_JOB_STATUSES.has(normalized)) {
    return {
      label: "Failed",
      style: { background: "#fee2e2", color: "#b91c1c" },
    };
  }

  if (PENDING_JOB_STATUSES.has(normalized) || !normalized) {
    return {
      label: "Pending",
      style: { background: "#e2e8f0", color: "#475569" },
    };
  }

  return {
    label: normalized,
    style: { background: "#f1f5f9", color: "#64748b" },
  };
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

function formatElection(e) {
  const year = (e.election_date || e.date || "").slice(0, 4);
  const typeMap = {
    general: "General Election",
    notional: "Notional (2019 boundaries)",
    local: "Local Elections",
    by_election: "By-election",
    pcc: "PCC Election",
  };
  const rawType = (e.election_type || e.electionType || "").toString().toLowerCase();
  const type = typeMap[rawType] || rawType || "Election";
  return year ? `${year} ${type}` : type;
}

function ConstituencySearch({ value, onChange, allowedConstituencies = [], assocByConstituencyId = {} }) {
  const [query, setQuery] = useState(value?.name || "");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (!q || (value?.name && q === value.name)) {
      setResults([]);
      setOpen(false);
      return undefined;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      try {
        const normalizedQuery = q.toLowerCase();
        const filtered = allowedConstituencies
          .filter((item) => {
            const name = (item.name || "").toLowerCase();
            const onsCode = (item.ons_code || "").toLowerCase();
            return name.includes(normalizedQuery) || onsCode.includes(normalizedQuery);
          })
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 10);
        setResults(filtered);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, value?.name, allowedConstituencies]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const select = (c) => {
    setQuery(c.name);
    setResults([]);
    setOpen(false);
    onChange(c.name, c.ons_code);
  };

  const clear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    onChange("", "");
  };

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="input"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!e.target.value) onChange("", "");
          }}
          placeholder="Type a constituency name…"
          autoComplete="off"
          aria-label="Search constituency"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {query && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear constituency"
            style={{
              background: "none",
              border: "1px solid #e2e8f0",
              borderRadius: 6,
              padding: "0 10px",
              cursor: "pointer",
              color: "#64748b",
              fontSize: 14,
            }}
          >
            ✕
          </button>
        )}
      </div>
      {searching && (
        <p style={{ fontSize: 12, color: "#64748b", margin: "4px 0 0" }}>
          Searching…
        </p>
      )}
      {open && results.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 6,
            margin: 0,
            padding: 0,
            listStyle: "none",
            zIndex: 50,
            maxHeight: 240,
            overflowY: "auto",
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
          }}
        >
          {results.map((c) => (
            <li
              key={c.id}
              role="option"
              aria-selected={false}
              onClick={() => select(c)}
              onKeyDown={(e) => e.key === "Enter" && select(c)}
              tabIndex={0}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 14,
                borderBottom: "1px solid #f1f5f9",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f8fafc";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span>{c.name}</span>
              {assocByConstituencyId[c.id] && (
                <span style={{ display: "block", fontSize: 12, color: "#64748b" }}>
                  {assocByConstituencyId[c.id]}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const presentation = getStatusPresentation(status);
  return (
    <span
      style={{
        ...presentation.style,
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {presentation.label}
    </span>
  );
}

export default function Uploads() {
  const { allowedConstituencies, loading: permsLoading } = usePermissions();
  const hasPermissions = allowedConstituencies !== null && allowedConstituencies.length > 0;
  const permissionsConfigured = allowedConstituencies !== null;
  // Map constituency id -> association name for showing in search dropdown
  const assocByConstituencyId = Object.fromEntries(
    (allowedConstituencies || [])
      .filter((c) => c.association_name)
      .map((c) => [c.id, c.association_name])
  );

  const [staged, setStaged] = useState([]);
  const [metadata, setMetadata] = useState({ clientName: "", notes: "" });
  const [constituency, setConstituency] = useState({ name: "", code: "" });
  const [submissionScope, setSubmissionScope] = useState({
    pconCode: "",
    wards: "",
    electionId: "",
  });
  const [elections, setElections] = useState([]);
  const [electionsError, setElectionsError] = useState(null);
  const [electionsLoading, setElectionsLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [jobs, setJobs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState("");
  const [loadError, setLoadError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const pollingRef = useRef(null);
  const loadJobs = useCallback(() => {
    setLoadError(null);
    return listJobs(25)
      .then((data) => setJobs(data.items || []))
      .catch((err) => setLoadError(err.message));
  }, []);

  // Load jobs on mount
  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    let cancelled = false;
    setElectionsLoading(true);
    setElectionsError(null);

    listElections(["OPEN", "UPCOMING"])
      .then((data) => {
        if (cancelled) return;
        const items = (data?.items || []).slice().sort((a, b) =>
          (b.date || b.election_date || "").localeCompare(a.date || a.election_date || "")
        );
        setElections(items);
        const general2024 = items.find(
          (e) =>
            (e.electionType || "").toString().trim().toUpperCase() === "GENERAL" &&
            (e.date || e.election_date || "").startsWith("2024")
        );
        const latestGeneral = items.find(
          (e) => (e.electionType || "").toString().trim().toUpperCase() === "GENERAL"
        );
        const defaultElection = general2024 || latestGeneral || items[0] || null;
        setSubmissionScope((scope) => ({
          ...scope,
          electionId: scope.electionId || defaultElection?.electionId || "",
        }));
      })
      .catch(() => {
        if (cancelled) return;
        setElectionsError("Failed to load elections.");
      })
      .finally(() => {
        if (!cancelled) setElectionsLoading(false);
      });

    return () => { cancelled = true; };
  }, []);

  // Poll active jobs
  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    if (!jobs.some((job) => isActiveJobStatus(job.status))) {
      return undefined;
    }

    pollingRef.current = setInterval(() => {
      loadJobs();
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [jobs, loadJobs]);

  const handleConstituencyChange = (name, code) => {
    setConstituency({ name, code });
    setSubmissionScope((s) => ({ ...s, pconCode: code }));
  };

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
      setUploadErrors(["Constituency is required."]);
      return;
    }
    const electionId = submissionScope.electionId.trim();
    if (!electionId) {
      setUploadErrors(["Election selection is required."]);
      return;
    }

    const wardCodes = submissionScope.wards
      .split(",")
      .map((entry) => entry.trim().toUpperCase())
      .filter(Boolean);

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
          pconCode,
          electionId,
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
        successfulFiles.add(file);
        uploadedCount += 1;
      } catch (err) {
        errors.push(`"${file.name}": ${err.message}`);
      }
    }

    setUploading(false);
    if (uploadedCount > 0) {
      setUploadSuccessMessage(
        "Your file has been submitted successfully. You will receive an email when processing is complete."
      );
      setStaged((prev) => prev.filter(({ file, error }) => error || !successfulFiles.has(file)));
      if (valid.length === uploadedCount) {
        setMetadata({ clientName: "", notes: "" });
      }
    }
    if (errors.length > 0) {
      setUploadErrors(errors);
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
    loadJobs();
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
              Upload your Marked Register PDF, select the relevant election and
              constituency, and we will process it and email you the results.
            </p>
          </div>
        </div>
      </Card>

      {permsLoading && (
        <Card>
          <p className="muted" style={{ margin: 0 }}>Checking account permissions…</p>
        </Card>
      )}

      {!permsLoading && permissionsConfigured && !hasPermissions && (
        <Card>
          <div role="alert" style={{ padding: "8px 0" }}>
            <p style={{ fontWeight: 600, marginBottom: 8 }}>
              No constituencies configured
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Your account has not yet been configured for any associations.
              Please contact{" "}
              <a href="mailto:paul@politicalsolutions.uk">
                paul@politicalsolutions.uk
              </a>{" "}
              to have your access set up.
            </p>
          </div>
        </Card>
      )}

      {(permsLoading || (permissionsConfigured && !hasPermissions)) ? null : (
      <Card title="Upload files">
        {uploadSuccessMessage && (
          <div className="status success" role="status" style={{ marginBottom: 16 }}>
            {uploadSuccessMessage}
          </div>
        )}
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
            {/* Client name */}
            <label className="field" htmlFor="clientName">
              <span>Client name (optional)</span>
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

            {/* Election */}
            <div className="field">
              <label htmlFor="electionId">Election</label>
              <select
                className="input"
                id="electionId"
                value={submissionScope.electionId}
                disabled={electionsLoading}
                onChange={(e) =>
                  setSubmissionScope((scope) => ({
                    ...scope,
                    electionId: e.target.value,
                  }))
                }
              >
                <option value="">
                  {electionsLoading ? "Loading elections…" : "Select an election"}
                </option>
                {elections.map((e) => (
                  <option key={e.electionId} value={e.electionId}>
                    {formatElection(e)}
                  </option>
                ))}
              </select>
              {electionsError && (
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "#b91c1c" }}>
                  {electionsError}
                </p>
              )}
            </div>

            {/* Constituency */}
            <div className="field">
              <label htmlFor="constituency-search">Constituency</label>
              <ConstituencySearch
                value={constituency}
                onChange={handleConstituencyChange}
                allowedConstituencies={allowedConstituencies || []}
                assocByConstituencyId={assocByConstituencyId}
              />
              {constituency.code && (
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                  Code: {constituency.code}
                </p>
              )}
            </div>

            {/* Notes */}
            <label className="field" htmlFor="notes">
              <span>Notes (optional)</span>
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

            {/* Advanced options */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  color: "#2563eb",
                  fontSize: 13,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <span>{showAdvanced ? "▾" : "▸"}</span>
                Advanced options
              </button>
              {showAdvanced && (
                <div style={{ marginTop: 10 }}>
                  <label className="field" htmlFor="wardCodes">
                    <span>Ward codes (optional, comma-separated WD24CD)</span>
                    <input
                      className="input"
                      id="wardCodes"
                      type="text"
                      value={submissionScope.wards}
                      onChange={(e) =>
                        setSubmissionScope((scope) => ({
                          ...scope,
                          wards: e.target.value,
                        }))
                      }
                      placeholder="e.g. W1001,W1002"
                    />
                  </label>
                </div>
              )}
            </div>

            <Button
              onClick={handleUpload}
              loading={uploading}
              disabled={uploading}
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
      )}

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
                    <td title={job.jobId}>{job.filename}</td>
                    <td>{job.fileType?.toUpperCase()}</td>
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
                        {isCompleteJobStatus(job.status) &&
                          Array.isArray(job.output?.files) &&
                          job.output.files.length > 0 && (
                          <Button
                            variant="primary"
                            className="button--small"
                            onClick={() => handleDownload(job)}
                          >
                            Download Results
                          </Button>
                        )}
                        {isCompleteJobStatus(job.status) &&
                          (!Array.isArray(job.output?.files) || job.output.files.length === 0) && (
                          <span style={{ color: "#64748b", fontSize: 12 }}>
                            Results not ready yet
                          </span>
                        )}
                        {isFailedJobStatus(job.status) && job.error?.message && (
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
