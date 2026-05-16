import { useEffect, useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import Button from "../../../components/Button.jsx";
import CsvDropZone from "../../../components/campaigns/CsvDropZone.jsx";
import { useCampaignAccess } from "../../../hooks/useCampaignAccess.js";
import { createSession, listManagedAssociations } from "../../../lib/campaignApi.js";
import { supabase } from "../../../lib/supabaseClient.js";
import {
  SESSION_TYPE_ORDER,
  SESSION_CSV_TEMPLATE_HEADERS,
  SESSION_CSV_TEMPLATE_SAMPLE,
  SESSION_CSV_TEMPLATE_FILENAME,
} from "../../../lib/campaignConfig.js";
import { buildCsv, downloadCsv } from "../../../lib/csvUtils.js";
import { bulkGeocodePostcodes, normalisePostcode } from "../../../lib/postcodeGeocoding.js";
import "./campaigns.css";

const COLUMN_INDEX = Object.fromEntries(SESSION_CSV_TEMPLATE_HEADERS.map((h, i) => [h, i]));

function parseSessionTypes(raw) {
  if (!raw) return [];
  return String(raw).split("|").map((t) => t.trim().toLowerCase()).filter(Boolean);
}

function validateRow(row, index, constituencyByName, associationByName, defaultAssociationId) {
  const errs = [];
  const rowNum = index + 2; // accounting for header row
  const r = {};
  for (const h of SESSION_CSV_TEMPLATE_HEADERS) {
    r[h] = (row[COLUMN_INDEX[h]] || "").trim();
  }

  // Required
  for (const key of ["title", "session_types", "constituency_name", "street_address", "postcode",
                      "session_date", "start_time", "duration_minutes",
                      "contact_name", "contact_phone", "contact_email"]) {
    if (!r[key]) errs.push({ row: rowNum, field: key, reason: "Required" });
  }

  // session_types
  const types = parseSessionTypes(r.session_types);
  if (types.length === 0) {
    errs.push({ row: rowNum, field: "session_types", reason: "At least one type required (pipe-delimited)" });
  }
  for (const t of types) {
    if (!SESSION_TYPE_ORDER.includes(t)) {
      errs.push({ row: rowNum, field: "session_types", reason: `Unknown type "${t}". Use: ${SESSION_TYPE_ORDER.join(", ")}` });
    }
  }

  // Association lookup — column wins, falls back to default selection
  let associationId = defaultAssociationId;
  if (r.association_name) {
    const a = associationByName.get(r.association_name.toLowerCase());
    if (!a) errs.push({ row: rowNum, field: "association_name", reason: "Not found among associations you manage" });
    else associationId = a.id;
  } else if (!defaultAssociationId) {
    errs.push({ row: rowNum, field: "association_name", reason: "Required when no default association selected above" });
  }

  // Constituency lookup — must be under the resolved association
  let constituencyId = null;
  if (r.constituency_name && associationId) {
    const key = `${associationId}::${r.constituency_name.toLowerCase()}`;
    const c = constituencyByName.get(key);
    if (!c) errs.push({ row: rowNum, field: "constituency_name", reason: "Not linked to that association" });
    else constituencyId = c.id;
  }

  if (r.session_date && !/^\d{4}-\d{2}-\d{2}$/.test(r.session_date)) {
    errs.push({ row: rowNum, field: "session_date", reason: "Use YYYY-MM-DD" });
  }
  if (r.start_time && !/^\d{2}:\d{2}$/.test(r.start_time)) {
    errs.push({ row: rowNum, field: "start_time", reason: "Use HH:MM" });
  }
  if (r.duration_minutes && (isNaN(Number(r.duration_minutes)) || Number(r.duration_minutes) <= 0)) {
    errs.push({ row: rowNum, field: "duration_minutes", reason: "Must be a positive number" });
  }
  if (r.max_capacity && (isNaN(Number(r.max_capacity)) || Number(r.max_capacity) <= 0)) {
    errs.push({ row: rowNum, field: "max_capacity", reason: "Must be a positive number or blank" });
  }
  if (r.contact_email && !/.+@.+\..+/.test(r.contact_email)) {
    errs.push({ row: rowNum, field: "contact_email", reason: "Invalid email" });
  }
  const canonPostcode = normalisePostcode(r.postcode);
  if (r.postcode && !canonPostcode) {
    errs.push({ row: rowNum, field: "postcode", reason: "Postcode format not recognised" });
  }

  if (errs.length > 0) return { errors: errs };

  return {
    record: {
      title: r.title,
      session_types: types,
      constituency_id: constituencyId,
      association_id: associationId,
      venue_name: r.venue_name || null,
      street_address: r.street_address,
      postcode: canonPostcode,
      latitude: null,   // populated by bulk geocoding below
      longitude: null,
      session_date: r.session_date,
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
  const [defaultAssociation, setDefaultAssociation] = useState("");
  const [constituencyByName, setConstituencyByName] = useState(new Map());  // key: `${associationId}::${nameLower}`
  const [parsed, setParsed] = useState(null);
  const [errors, setErrors] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (access.loading || !access.access) return;
    listManagedAssociations(access.access).then((list) => {
      setAssociations(list);
      if (list.length === 1) setDefaultAssociation(list[0].id);
    });
  }, [access.loading, access.access]);

  // Pre-fetch constituency-name → id mapping for every association the user manages.
  useEffect(() => {
    if (associations.length === 0) return;
    let cancelled = false;
    supabase
      .from("association_constituencies")
      .select("association_id, constituency_id, constituencies(id, name)")
      .in("association_id", associations.map((a) => a.id))
      .then(({ data }) => {
        if (cancelled) return;
        const m = new Map();
        for (const row of data || []) {
          if (row.constituencies && row.constituencies.name) {
            m.set(`${row.association_id}::${row.constituencies.name.toLowerCase()}`, {
              id: row.constituencies.id,
              name: row.constituencies.name,
            });
          }
        }
        setConstituencyByName(m);
      });
    return () => { cancelled = true; };
  }, [associations]);

  const associationByName = useMemo(() => {
    const m = new Map();
    for (const a of associations) m.set(a.name.toLowerCase(), a);
    return m;
  }, [associations]);

  const handleParsed = (result) => {
    setErrors([]);
    setResults(null);
    if (result.headers.length !== SESSION_CSV_TEMPLATE_HEADERS.length) {
      setErrors([{ row: 1, field: "(headers)", reason: `Expected ${SESSION_CSV_TEMPLATE_HEADERS.length} columns: ${SESSION_CSV_TEMPLATE_HEADERS.join(", ")}` }]);
      return;
    }
    const rowResults = result.rows.map((row, idx) => validateRow(row, idx, constituencyByName, associationByName, defaultAssociation));
    const allErrors = rowResults.flatMap((r) => r.errors || []);
    const validRecords = rowResults.filter((r) => r.record).map((r) => r.record);
    setParsed({ allErrors, validRecords, total: result.rows.length });
    setErrors(allErrors);
  };

  const handleSubmit = async () => {
    if (!parsed) return;
    setSubmitting(true);

    // Bulk-geocode all postcodes in one call before inserting.
    const postcodes = parsed.validRecords.map((r) => r.postcode).filter(Boolean);
    const coords = await bulkGeocodePostcodes(postcodes);

    const successes = [];
    const failures = [];
    for (const record of parsed.validRecords) {
      const c = coords.get(record.postcode);
      const enriched = c ? { ...record, latitude: c.lat, longitude: c.lon } : record;
      try {
        const created = await createSession(enriched, access.cognitoSub);
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
        Download the template, fill it in (one row per session), and drop it below.
        Multiple associations in a single file are supported — fill in <code>association_name</code> per row,
        or leave it blank and pick a default from the dropdown below.
      </p>

      <div className="campaigns-form-row" style={{ maxWidth: 480 }}>
        <label htmlFor="association">Default association (used when a row has no <code>association_name</code>)</label>
        <select id="association" value={defaultAssociation} onChange={(e) => setDefaultAssociation(e.target.value)}>
          <option value="">No default — every row must include association_name</option>
          {associations.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <CsvDropZone
        templateHeaders={SESSION_CSV_TEMPLATE_HEADERS}
        templateSample={SESSION_CSV_TEMPLATE_SAMPLE}
        templateName={SESSION_CSV_TEMPLATE_FILENAME}
        onParsed={handleParsed}
      />

      {parsed && (
        <section style={{ background: "var(--portal-surface)", border: "1px solid var(--portal-border)", borderRadius: 4, padding: "var(--space-5)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-4)", gap: "var(--space-3)", flexWrap: "wrap" }}>
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
