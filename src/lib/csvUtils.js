// RFC 4180 minimal CSV parser + writer.
//
// Highest-risk component of the campaigns module: real users will upload
// CSVs produced by Excel on Windows. The two non-negotiable cases are
//   (a) quoted fields containing commas (`"Smith, John",SW1A,Canvass`)
//   (b) Windows CRLF (\r\n) line endings
// Both are covered by the parser state machine below and by the matching
// tests in csvUtils.test.js. Additional cases handled:
//   - escaped quotes inside quoted fields (`""` → `"`)
//   - UTF-8 BOM at file start (Excel on Windows commonly emits one)
//   - empty cells (`a,,b` → ["a", "", "b"])
//   - trailing newline
//
// The parser is a three-state machine: BETWEEN_FIELDS, IN_UNQUOTED,
// IN_QUOTED. Single pass, character-by-character.

const STATE_BETWEEN = 0;
const STATE_UNQUOTED = 1;
const STATE_QUOTED = 2;

/**
 * Parse CSV text into headers and rows.
 * @param {string} text
 * @returns {{ headers: string[], rows: string[][] }}
 */
export function parseCsv(text) {
  if (text == null) throw new Error("parseCsv: input is null");

  // Strip UTF-8 BOM if present.
  let src = String(text);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);

  const records = [];
  let row = [];
  let field = "";
  let state = STATE_BETWEEN;
  let line = 1;
  let col = 0;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    col += 1;

    if (state === STATE_BETWEEN) {
      if (ch === '"') {
        state = STATE_QUOTED;
        continue;
      }
      if (ch === ",") {
        row.push("");
        continue;
      }
      if (ch === "\r") {
        // swallow; \r\n is treated as one record separator
        if (src[i + 1] === "\n") i += 1;
        records.push(row);
        row = [];
        line += 1;
        col = 0;
        continue;
      }
      if (ch === "\n") {
        records.push(row);
        row = [];
        line += 1;
        col = 0;
        continue;
      }
      field += ch;
      state = STATE_UNQUOTED;
      continue;
    }

    if (state === STATE_UNQUOTED) {
      if (ch === ",") {
        row.push(field);
        field = "";
        state = STATE_BETWEEN;
        continue;
      }
      if (ch === "\r") {
        if (src[i + 1] === "\n") i += 1;
        row.push(field);
        field = "";
        records.push(row);
        row = [];
        state = STATE_BETWEEN;
        line += 1;
        col = 0;
        continue;
      }
      if (ch === "\n") {
        row.push(field);
        field = "";
        records.push(row);
        row = [];
        state = STATE_BETWEEN;
        line += 1;
        col = 0;
        continue;
      }
      field += ch;
      continue;
    }

    // STATE_QUOTED
    if (ch === '"') {
      if (src[i + 1] === '"') {
        // escaped quote
        field += '"';
        i += 1;
        continue;
      }
      // end of quoted field — next char must be , \r \n or end-of-input
      const next = src[i + 1];
      if (next === undefined || next === "," || next === "\r" || next === "\n") {
        row.push(field);
        field = "";
        state = STATE_BETWEEN;
        // consume trailing , or newline so we don't double-push
        if (next === ",") {
          i += 1;
        } else if (next === "\r") {
          if (src[i + 2] === "\n") i += 2; else i += 1;
          records.push(row);
          row = [];
          line += 1;
          col = 0;
        } else if (next === "\n") {
          i += 1;
          records.push(row);
          row = [];
          line += 1;
          col = 0;
        }
        continue;
      }
      throw new Error(`parseCsv: unexpected character after closing quote at line ${line} column ${col}`);
    }
    field += ch;
  }

  // EOF — flush any in-progress field/row
  if (state === STATE_QUOTED) {
    throw new Error("parseCsv: unterminated quoted field at end of input");
  }
  if (state === STATE_UNQUOTED || field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  // Drop a single trailing empty row (common from trailing newline).
  if (records.length > 0) {
    const last = records[records.length - 1];
    if (last.length === 1 && last[0] === "") records.pop();
  }

  if (records.length === 0) return { headers: [], rows: [] };

  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1);
  return { headers, rows };
}

/**
 * Serialise headers + rows back to CSV (LF line endings, RFC 4180 quoting).
 * @param {string[]} headers
 * @param {string[][]} rows
 * @returns {string}
 */
export function buildCsv(headers, rows) {
  const escape = (value) => {
    const s = value == null ? "" : String(value);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const lines = [headers.map(escape).join(",")];
  for (const row of rows) {
    lines.push(row.map(escape).join(","));
  }
  return lines.join("\n") + "\n";
}

/**
 * Trigger a browser download of a CSV string.
 * Browser-only — uses Blob + anchor click.
 */
export function downloadCsv(filename, csvText) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
