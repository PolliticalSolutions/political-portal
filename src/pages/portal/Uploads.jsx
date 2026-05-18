import { useCallback, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import Button from "../../components/Button.jsx";
import Card from "../../components/Card.jsx";
import { createJob, listElections, listJobs } from "../../lib/uploadApi.js";
import { usePermissions } from "../../context/PermissionsContext.jsx";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
const ALLOWED_EXTENSIONS = new Set([".pdf", ".csv"]);
const POLL_INTERVAL_MS = 30000;
const MAX_PCON_FILTER_CODES = 500;
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

/** Format: ConstituencyName — ElectionName — Date */
function formatElectionLabel(e, constituencyName) {
  const dateValue = e.polling_date || e.election_date || e.date || "";
  const dateStr = dateValue
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" }).format(
        new Date(`${dateValue}T00:00:00`)
      )
    : "";

  const rawType = (e.electionType || e.election_type || "").toString().trim().toUpperCase();
  const year = dateValue.slice(0, 4);
  let name;
  if (rawType === "GENERAL") name = year ? `${year} General Election` : "General Election";
  else if (rawType === "NOTIONAL") name = e.name || (year ? `${year} Notional` : "Notional");
  else if (rawType === "BY_ELECTION" || e.isByElection) {
    const base = (e.name || "").trim();
    name = /by-election/i.test(base) ? base : `${base || "Election"} By-Election`;
  } else if (rawType === "LOCAL") {
    const base = (e.localAuthorityName || e.authority || e.name || "Local").replace(/\s+elections?$/i, "").trim();
    name = /elections?$/i.test(base) ? base : `${base} Elections`;
  } else {
    name = e.name || "Election";
  }

  return [constituencyName, name, dateStr].filter(Boolean).join(" — ");
}

// ── ConstituencySearch (kept as-is) ──────────────────────────────────────────

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
        const normalized = q.toLowerCase();
        const filtered = allowedConstituencies
          .filter((item) => {
            const n = (item.name || "").toLowerCase();
            const code = (item.ons_code || "").toLowerCase();
            return n.includes(normalized) || code.includes(normalized);
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
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
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
              border: "1px solid var(--color-border)",
              borderRadius: 6,
              padding: "0 10px",
              cursor: "pointer",
              color: "var(--color-text-muted)",
              fontSize: 14,
            }}
          >
            ✕
          </button>
        )}
      </div>
      {searching && <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "4px 0 0" }}>Searching…</p>}
      {open && results.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            background: "white",
            border: "1px solid var(--color-border)",
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
              onMouseEnter={(e) => { e.currentTarget.style.background = "#f8fafc"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span>{c.name}</span>
              {assocByConstituencyId[c.id] && (
                <span style={{ display: "block", fontSize: 12, color: "var(--color-text-muted)" }}>
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

function ConfirmUploadModal({ constituency, electionLabel, files, onConfirm, onBack }) {
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
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
        }}
        onClick={onBack}
        aria-hidden="true"
      />
      {/* Panel */}
      <div
        style={{
          position: "relative",
          background: "white",
          borderRadius: 12,
          padding: 28,
          maxWidth: 520,
          width: "100%",
          boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        }}
      >
        <h2 id="confirm-modal-title" style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700 }}>
          Confirm upload
        </h2>

        <dl style={{ margin: "0 0 16px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px" }}>
          <dt style={{ fontWeight: 600, color: "var(--color-text-secondary)", fontSize: 14 }}>Constituency</dt>
          <dd style={{ margin: 0, fontSize: 14 }}>
            {constituency.name}
            {constituency.code && (
              <span style={{ marginLeft: 6, color: "var(--color-text-muted)", fontSize: 12 }}>({constituency.code})</span>
            )}
          </dd>
          <dt style={{ fontWeight: 600, color: "var(--color-text-secondary)", fontSize: 14 }}>Election</dt>
          <dd style={{ margin: 0, fontSize: 14 }}>{electionLabel}</dd>
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
  const { allowedConstituencies, loading: permsLoading } = usePermissions();

  const hasPermissions = allowedConstituencies !== null && allowedConstituencies.length > 0;
  const permissionsConfigured = allowedConstituencies !== null;

  const assocByConstituencyId = Object.fromEntries(
    (allowedConstituencies || [])
      .filter((c) => c.association_name)
      .map((c) => [c.id, c.association_name])
  );

  // ── Form state ──────────────────────────────────────────────────────────────
  const [constituency, setConstituency] = useState({ name: "", code: "" });
  const [elections, setElections] = useState([]);
  const [electionsError, setElectionsError] = useState(null);
  const [electionsLoading, setElectionsLoading] = useState(false);
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [staged, setStaged] = useState([]);
  const [metadata, setMetadata] = useState({ clientName: "", notes: "" });
  const [wardCodes, setWardCodes] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Upload state ────────────────────────────────────────────────────────────
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState([]);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState("");

  // ── Jobs state ──────────────────────────────────────────────────────────────
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

  // ── Load elections per constituency ─────────────────────────────────────────
  useEffect(() => {
    const code = constituency.code;
    if (!code) {
      setElections([]);
      setSelectedElectionId("");
      return undefined;
    }

    let cancelled = false;
    setElectionsLoading(true);
    setElectionsError(null);
    setSelectedElectionId("");

    listElections(["OPEN", "UPCOMING", "CLOSED", "ARCHIVED"], [code])
      .then((data) => {
        if (cancelled) return;
        const items = (data?.items || []).slice().sort((a, b) =>
          (b.polling_date || b.date || b.election_date || "").localeCompare(
            a.polling_date || a.date || a.election_date || ""
          )
        );
        setElections(items);
        // Auto-select the most recent general election, or first available
        const latestGeneral = items.find(
          (e) => (e.electionType || e.election_type || "").toString().trim().toUpperCase() === "GENERAL"
        );
        const defaultElection = latestGeneral || items[0] || null;
        if (defaultElection) setSelectedElectionId(defaultElection.electionId);
      })
      .catch(() => {
        if (cancelled) return;
        setElectionsError("Failed to load elections for this constituency.");
      })
      .finally(() => {
        if (!cancelled) setElectionsLoading(false);
      });

    return () => { cancelled = true; };
  }, [constituency.code]);

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

  const handleConstituencyChange = (name, code) => {
    setConstituency({ name, code });
  };

  // ── Open confirm modal ───────────────────────────────────────────────────────
  const handleUploadClick = () => {
    const valid = staged.filter((s) => !s.error);
    if (valid.length === 0) return;

    const errors = [];
    if (!constituency.code) errors.push("Please select a constituency.");
    if (!selectedElectionId) errors.push("Please select an election.");
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
    const pconCode = constituency.code.trim().toUpperCase();
    const electionId = selectedElectionId.trim();
    const parsedWards = wardCodes
      .split(",")
      .map((w) => w.trim().toUpperCase())
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
          batchId,
          totalFilesInBatch,
          constituencyOnsCode: pconCode,
          ...(parsedWards.length > 0 ? { wards: parsedWards } : {}),
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

        const postRes = await fetch(upload.url, { method: "POST", body: form });
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
        setMetadata({ clientName: "", notes: "" });
        setWardCodes("");
      }
    }
    if (errors.length > 0) setUploadErrors(errors);
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const validStaged = staged.filter((s) => !s.error);
  const invalidStaged = staged.filter((s) => s.error);

  const selectedElection = elections.find((e) => e.electionId === selectedElectionId) || null;
  const electionLabel = selectedElection
    ? formatElectionLabel(selectedElection, constituency.name)
    : "";

  const canUpload = !uploading && validStaged.length > 0 && !!constituency.code && !!selectedElectionId;

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
              Select a constituency and election, then upload your Marked Register PDFs. We will process
              them and email you the results.
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
            <p style={{ fontWeight: 600, marginBottom: 8 }}>No constituencies configured</p>
            <p className="muted" style={{ margin: 0 }}>
              Your account has not yet been configured for any associations.
              Please contact{" "}
              <a href="mailto:paul@politicalsolutions.uk">paul@politicalsolutions.uk</a>{" "}
              to have your access set up.
            </p>
          </div>
        </Card>
      )}

      {!(permsLoading || (permissionsConfigured && !hasPermissions)) && (
        <Card title="Upload files">
          {uploadSuccessMessage && (
            <div className="status success" role="status" style={{ marginBottom: 16 }}>
              {uploadSuccessMessage}
            </div>
          )}

          {/* ── Step 1: Constituency ── */}
          <div className="stack" style={{ gap: 16 }}>
            <div className="field">
              <label htmlFor="constituency-search">
                <strong>Step 1:</strong> Select constituency
              </label>
              <ConstituencySearch
                value={constituency}
                onChange={handleConstituencyChange}
                allowedConstituencies={allowedConstituencies || []}
                assocByConstituencyId={assocByConstituencyId}
              />
              {constituency.code && (
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
                  Code: {constituency.code}
                </p>
              )}
            </div>

            {/* ── Step 2: Election ── */}
            <div className="field">
              <label htmlFor="electionId">
                <strong>Step 2:</strong> Select election
              </label>
              {!constituency.code ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)" }}>
                  Select a constituency above to load available elections.
                </p>
              ) : (
                <>
                  <select
                    className="input"
                    id="electionId"
                    value={selectedElectionId}
                    disabled={electionsLoading}
                    onChange={(e) => setSelectedElectionId(e.target.value)}
                  >
                    <option value="">
                      {electionsLoading ? "Loading elections…" : elections.length === 0 ? "No elections available" : "Select an election"}
                    </option>
                    {elections.map((e) => (
                      <option key={e.electionId} value={e.electionId}>
                        {formatElectionLabel(e, constituency.name)}
                      </option>
                    ))}
                  </select>
                  {electionsError && (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--color-danger)" }}>{electionsError}</p>
                  )}
                </>
              )}
            </div>

            {/* ── Step 3: Files ── */}
            <div>
              <p style={{ margin: "0 0 8px", fontWeight: 600, fontSize: 14 }}>
                <strong>Step 3:</strong> Add files
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

            {/* Optional metadata */}
            {validStaged.length > 0 && (
              <div className="stack" style={{ gap: 12 }}>
                <label className="field" htmlFor="clientName">
                  <span>Client name (optional)</span>
                  <input
                    className="input"
                    id="clientName"
                    type="text"
                    value={metadata.clientName}
                    onChange={(e) => setMetadata((m) => ({ ...m, clientName: e.target.value }))}
                    placeholder="e.g. North Association"
                  />
                </label>

                <label className="field" htmlFor="notes">
                  <span>Notes (optional)</span>
                  <textarea
                    className="input"
                    id="notes"
                    rows={3}
                    value={metadata.notes}
                    onChange={(e) => setMetadata((m) => ({ ...m, notes: e.target.value }))}
                    placeholder="Any additional notes about this batch"
                  />
                </label>

                <div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced((v) => !v)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "var(--color-navy-mid)",
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
                          value={wardCodes}
                          onChange={(e) => setWardCodes(e.target.value)}
                          placeholder="e.g. W1001,W1002"
                        />
                      </label>
                    </div>
                  )}
                </div>

                <Button
                  onClick={handleUploadClick}
                  loading={uploading}
                  disabled={!canUpload}
                >
                  {uploading
                    ? "Uploading…"
                    : `Review and upload ${validStaged.length} file${validStaged.length !== 1 ? "s" : ""}`}
                </Button>
              </div>
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
      )}

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

      {/* Confirmation modal rendered at root level */}
      {confirmModalOpen && (
        <ConfirmUploadModal
          constituency={constituency}
          electionLabel={electionLabel}
          files={validStaged.map((s) => s.file)}
          onConfirm={handleConfirm}
          onBack={() => setConfirmModalOpen(false)}
        />
      )}
    </div>
  );
}
