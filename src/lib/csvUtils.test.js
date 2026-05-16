import { describe, it, expect } from "vitest";
import { parseCsv, buildCsv } from "./csvUtils.js";

describe("parseCsv — Excel-on-Windows compatibility (non-negotiable)", () => {
  it("(a) handles quoted fields containing commas — the real-user failure mode", () => {
    const { headers, rows } = parseCsv('name,postcode,type\n"Smith, John",SW1A,Canvass\n');
    expect(headers).toEqual(["name", "postcode", "type"]);
    expect(rows).toEqual([["Smith, John", "SW1A", "Canvass"]]);
  });

  it("(b) handles Windows CRLF line endings", () => {
    const { headers, rows } = parseCsv("a,b\r\nc,d\r\ne,f\r\n");
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([
      ["c", "d"],
      ["e", "f"],
    ]);
  });
});

describe("parseCsv — additional cases", () => {
  it("(c) unescapes doubled quotes inside a quoted field", () => {
    const { rows } = parseCsv('header\n"he said ""hi"""\n');
    expect(rows).toEqual([['he said "hi"']]);
  });

  it("(d) strips a UTF-8 BOM at the start of the file", () => {
    const bom = "﻿";
    const { headers, rows } = parseCsv(`${bom}a,b\nc,d\n`);
    expect(headers).toEqual(["a", "b"]);
    expect(rows).toEqual([["c", "d"]]);
  });

  it("(e) preserves empty cells", () => {
    const { headers, rows } = parseCsv("a,b,c\nx,,z\n");
    expect(headers).toEqual(["a", "b", "c"]);
    expect(rows).toEqual([["x", "", "z"]]);
  });

  it("(f) tolerates a trailing newline without producing an empty final row", () => {
    const { rows } = parseCsv("h\na\nb\n");
    expect(rows).toEqual([["a"], ["b"]]);
  });

  it("(g) throws with a clear message on an unterminated quoted field", () => {
    expect(() => parseCsv('h\n"unterminated')).toThrow(/unterminated/i);
  });

  it("handles a CSV with a single header and no rows", () => {
    const { headers, rows } = parseCsv("h\n");
    expect(headers).toEqual(["h"]);
    expect(rows).toEqual([]);
  });

  it("preserves whitespace inside quoted fields", () => {
    const { rows } = parseCsv('h\n"  spaced  "\n');
    expect(rows).toEqual([["  spaced  "]]);
  });

  it("handles a multi-line quoted field (quoted fields may contain newlines)", () => {
    const { rows } = parseCsv('h\n"line1\nline2"\n');
    expect(rows).toEqual([["line1\nline2"]]);
  });
});

describe("buildCsv", () => {
  it("escapes fields containing commas with double quotes", () => {
    const csv = buildCsv(["name", "value"], [["Smith, John", "ok"]]);
    expect(csv).toBe('name,value\n"Smith, John",ok\n');
  });

  it("escapes embedded quotes by doubling them", () => {
    const csv = buildCsv(["text"], [['he said "hi"']]);
    expect(csv).toBe('text\n"he said ""hi"""\n');
  });

  it("does not quote plain alphanumeric fields", () => {
    const csv = buildCsv(["a", "b"], [["one", "two"]]);
    expect(csv).toBe("a,b\none,two\n");
  });

  it("roundtrips with parseCsv", () => {
    const headers = ["title", "type", "address"];
    const rows = [
      ["Saturday canvass", "canvass", "14 High Street, London"],
      ["Phone bank", "phone_bank", 'Office, with "quote"'],
    ];
    const csv = buildCsv(headers, rows);
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(headers);
    expect(parsed.rows).toEqual(rows);
  });
});
