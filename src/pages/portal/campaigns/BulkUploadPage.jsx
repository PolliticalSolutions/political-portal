import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import CsvDropZone from "../../../components/campaigns/CsvDropZone.jsx";
import { useCampaignAccess } from "../../../hooks/useCampaignAccess.js";
import { createSession, listManagedAssociations } from "../../../lib/campaignApi.js";
import { supabase } from "../../../lib/supabaseClient.js";
import { SESSION_TYPE_ORDER } from "../../../lib/campaignConfig.js";
import { buildCsv, downloadCsv } from "../../../lib/csvUtils.js";
import "./campaigns.css";

const TEMPLATE_HEADERS = [
  "title", "session_type", "constituency_name", "meeting_place",
  "date", "start_time", "duration_minutes",
  "contact_name", "contact_phone", "contact_email",
  "max_capacity", "notes",
];

const TEMPLATE_SAMPLE = [
  ["Saturday morning canvass", "canvass", "Camberwell and Peckham", "Association office, 14 High Street",
   "2026-06-07", "10:00", "180", "Sarah Henderson", "020 7123 4567", "sarah@example.org", "20", "Bring waterproofs"],
];

function validateRow(row, index, constituencyByName, associationDefault) {
  const errors = [];
  const r = {};
  for (let i = 0; i < TEMPLATE_HEADERS.length; i++) {
    r[TEMPLATE_HEADERS[i]] = (row[i] || "").trim();
  }
  const required = ["title", "session_type", "constituency_name", "meeting_place", "date", "start_time", "duration_minutes", "contact_name", "contact_phone", "contact_email"];
  for (const key of required) {
    if (!r[key]) errors.push({ row: index + 2, field: key, reason: "Required" });
  }
  if (r.session_type && !SESSION_TYPE_ORDER.includes(r.session_type)) {
    errors.push({ row: index + 2, field: "session_type", reason: `Must be one of: ${SESSION_TYPE_ORDER.join(", ")}` });
  }
  if (r.date && !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) {
    errors.push({ row: index + 2, field: "date", reason: "Use YYYY-MM-DD" });
  }
  if (r.start_time && !/^\d{2}:\d{2}$/.test(r.start_time)) {
    errors.push({ row: index + 2, field: "start_time", reason: "Use HH:MM" });
  }
  if (r.duration_minutes && (isNaN(Number(r.duration_minutes)) || Number(r.duration_minutes) <= 0)) {
    errors.push({ row: index + 2, field: "duration_minutes", reason: "Must be a positive number" });
  }
  if (r.max_capacity && (isNaN(Number(r.max_capacity)) || Number(r.max_capacity) <= 0)) {
    errors.push({ row: index + 2, field: "max_capacity", reason: "Must be a positive number or blank" });
  }
  if (r.contact_email && !/.+@.+\..+/.test(r.contact_email)) {
    errors.push({ row: index + 2, field: "contact_email", reason: "Invalid email" });
  }
  const constituency = constituencyByName.get(r.constituency_name.toLowerCase());
  if (r.constituency_name && !constituency) {
    errors.push({ row: index + 2, field: "constituency_name", reason: "Not found in your association's constituencies" });
  }

  if (errors.length > 0) return { errors };

  return {
    record: {
      title: r.title,
      session_type: r.session_type,
      constituency_id: constituency.id,
      association_id: associationDefault,
      meeting_place: r.meeting_place,
      session_date: r.date,
      start_time: r.start_time + ":00",
      duration_minutes: Number(r.duration_minutes),
      contact_name: r.contact_name,
      contact_phone: r.contact_phone,
      contact_email: r.contact_email,
      max_capacity: r.max_capacity ? Number(r.max_capacity) : null,
      notes: r.notes || null,
      status: "published",
    },
  };
}

export default function BulkUploadPage() {
  const access = useCampaignAccess();
  const [associations, setAssociations] = useState([]);
  const [selectedAssociation, setSelectedAssociation] = useState("");
  const [constituencyByName, setConstituencyByName] = useState(new Map());
  const [parsed, setParsed] = useState(null);
  const [errors, setErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (access.loading || !access.access) return;
    listManagedAssociations(access.access).then((list) => {
      setAssociations(list);
      if (list.length === 1) setSelectedAssociation(list[0].id);
    });
  }, [access.loading, access.access]);

  useEffect(() => {
    if (!selectedAssociation) return;
    let cancelled = false;
    supabase
      .from("association_constituencies")
      .select("constituency_id, constituencies(id, name)")
      .eq("association_id", selectedAssociation)
      .then(({ data }) => {
        if (cancelled) return;
        const m = new Map();
        for (const row of data || []) {
          if (row.constituencies && row.constituencies.name) {
            m.set(row.constituencies.name.toLowerCase(), { id: row.constituencies.id, name: row.constituencies.name });
          }
        }
        setConstituencyByName(m);
      });
    return () => { cancelled = true; };
  }, [selectedAssociation]);

  const handleParsed = (result) => {
    setErrors([]);
    setResults(null);
    if (!selectedAssociation) {
      setErrors([{ row: 0, field: "(file)", reason: "Choose an association before uploading." }]);
      return;
    }
    if (result.headers.length !== TEMPLATE_HEADERS.length) {
      setErrors([{ row: 1, field: "(headers)", reason: `Expected ${TEMPLATE_HEADERS.length} columns: ${TEMPLATE_HEADERS.join(", ")}` }]);
      return;
    }
    const rowResults = result.rows.map((row, idx) => validateRow(row, idx, constituencyByName, selectedAssociation));
    const allErrors = rowResults.flatMap((r) => r.errors || []);
    const validRecords = rowResults.filter((r) => r.record).map((r) => r.record);
    setParsed({ allErrors, validRecords, total: result.rows.length });
    setErrors(allErrors);
  };

  const handleSubmit = async () => {
    if (!parsed) return;
    setSubmitting(true);
    const successes = [];
    const failures = [];
    for (const record of parsed.validRecords) {
      try {
        const created = await createSession(record, access.cognitoSub);
        successes.push(created);
      } catch (err) {
        failures.push({ title: record.title, reason: err.message });
      }
    }
    setResults({ successes: successes.length, failures, totalRows: parsed.total, rejected: parsed.allErrors.length });
    setSubmitting(false);
  };

  const downloadErrorReport = () => {
    const headers = ["row", "field", "reason"];
    const rows = errors.map((e) => [String(e.row), e.field, e.reason]);
    downloadCsv("bulk-upload-errors.csv", buildCsv(headers, rows));
  };

  const canCreate = access.access && (access.access.isAdmin || access.access.isCampaignManagerFor.size > 0);
  if (access.loading) return <div className="page stack"><p style={{ color: "var(--portal-text-muted)" }}>Loading…</p></div>;
  if (!canCreate) return <div className="page stack"><p>You don't have permission to bulk-upload sessions.</p></div>;

  return (
    <div className="page stack campaigns-page">
      <Helmet><title>Bulk upload sessions — Political Solutions</title></Helmet>
      <p style={{ margin: 0 }}>
        <Link to="/portal/campaigns" style={{ color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
          ← All sessions
        </Link>
      </p>
      <h1 style={{ margin: 0, fontSize: "var(--text-2xl)", fontWeight: 700, color: "var(--portal-text-primary)", letterSpacing: "-0.01em" }}>
        Bulk upload sessions
      </h1>
      <p style={{ margin: 0, color: "var(--portal-text-secondary)", maxWidth: 640 }}>
        Upload a CSV to create a full campaign calendar in one go. Download the template, fill it in, and drop the file below.
        Valid rows are saved as Published sessions; invalid rows are listed and can be exported as an error report.
      </p>

      <div className="campaigns-form-row" style={{ maxWidth: 480 }}>
        <label htmlFor="association">Association</label>
        <select id="association" value={selectedAssociation} onChange={(e) => setSelectedAssociation(e.target.value)}>
          <option value="">Choose an association</option>
          {associations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <CsvDropZone
        templateHeaders={TEMPLATE_HEADERS}
        templateSample={TEMPLATE_SAMPLE}
        templateName="campaign-sessions-template.csv"
        onParsed={handleParsed}
      />

      {parsed && (
        <section style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 4, padding: "var(--space-5)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)" }}>
            <div>
              <div style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>
                {parsed.validRecords.length} valid · {parsed.allErrors.length} errors · {parsed.total} total
              </div>
              <div style={{ color: "var(--portal-text-secondary)", fontSize: "var(--text-sm)" }}>
                Valid rows will be created. Invalid rows are skipped.
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              {errors.length > 0 && (
                <Button variant="secondary" onClick={downloadErrorReport}>Download error report</Button>
              )}
              <Button onClick={handleSubmit} disabled={parsed.validRecords.length === 0 || submitting} loading={submitting}>
                Create {parsed.validRecords.length} session{parsed.validRecords.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>

          {errors.length > 0 && (
            <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th align="left">Row</th><th align="left">Field</th><th align="left">Reason</th></tr></thead>
              <tbody>
                {errors.map((e, i) => (
                  <tr key={i}>
                    <td>{e.row}</td>
                    <td>{e.field}</td>
                    <td>{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {results && (
        <section style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 4, padding: "var(--space-5)" }}>
          <h2 style={{ margin: 0, fontSize: "var(--text-lg)" }}>Upload complete</h2>
          <p style={{ margin: "var(--space-3) 0", color: "var(--portal-text-secondary)" }}>
            {results.successes} of {results.totalRows - results.rejected} valid rows created. {results.rejected} rejected as invalid. {results.failures.length} failed during save.
          </p>
          <Button as={Link} to="/portal/campaigns">Back to sessions</Button>
        </section>
      )}
    </div>
  );
}
