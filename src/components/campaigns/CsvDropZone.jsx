import { useRef, useState } from "react";
import { parseCsv, buildCsv, downloadCsv } from "../../lib/csvUtils.js";

/**
 * File drop + picker with inline parse-error reporting.
 *
 * @param {{
 *   templateHeaders: string[],
 *   templateSample?: string[][],
 *   templateName?: string,
 *   onParsed: (result: { headers: string[], rows: string[][] }) => void,
 * }} props
 */
export default function CsvDropZone({ templateHeaders, templateSample = [], templateName = "campaign-sessions-template.csv", onParsed }) {
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  const [filename, setFilename] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file) => {
    setError("");
    setFilename(file.name);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      onParsed(parsed);
    } catch (err) {
      setError(err.message || "Could not parse the CSV file.");
    }
  };

  const onChange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) handleFile(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const downloadTemplate = () => {
    const csv = buildCsv(templateHeaders, templateSample);
    downloadCsv(templateName, csv);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current && inputRef.current.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current && inputRef.current.click(); } }}
        style={{
          padding: "var(--space-8)",
          textAlign: "center",
          background: dragOver ? "var(--portal-navy)" : "var(--portal-surface)",
          border: `2px dashed ${dragOver ? "var(--portal-cta)" : "var(--portal-border-strong)"}`,
          borderRadius: 4,
          cursor: "pointer",
          color: dragOver ? "#FFFFFF" : "var(--portal-text-primary)",
          transition: "background 0.15s ease, border-color 0.15s ease",
        }}
      >
        <div style={{ fontSize: "var(--text-lg)", fontWeight: 600 }}>
          {filename || "Drop a CSV file here, or click to choose"}
        </div>
        <div style={{ fontSize: "var(--text-sm)", color: "var(--portal-text-secondary)", marginTop: 6 }}>
          UTF-8 encoded, comma-separated, first row is the header
        </div>
        <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={onChange} style={{ display: "none" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={downloadTemplate}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--portal-text-secondary)",
            cursor: "pointer",
            fontSize: "var(--text-sm)",
            textDecoration: "underline",
            padding: 0,
          }}
        >
          Download CSV template
        </button>
      </div>
      {error && <p role="alert" style={{ color: "var(--portal-danger)" }}>{error}</p>}
    </div>
  );
}
