# Local register structure audit

Use this audit to diagnose polling-district and declared-range recognition
without uploading or manually redacting marked-register PDFs.

## Privacy boundary

- PDFs stay in their original folder and are mounted read-only.
- The processing container runs with networking disabled.
- Only the top header band of each content page is sent to local Tesseract.
- Rendered pages and raw OCR text remain in memory and are discarded.
- The saved JSON contains document indexes, page counts, recognised
  polling-district codes, declared numbering ranges, and header-run boundaries.
- It does not contain filenames, input paths, elector rows, elector numbers,
  names, addresses, raw OCR text, or page images.

Do not copy source PDFs into the repository. Reports are written under the
gitignored `infra/upload-api/local-trial-output/` directory by default.

## Run a complete header audit

```powershell
& .\infra\upload-api\local_trial\run-structure-audit.ps1 `
  -InputPath "C:\full\path\to\folder"
```

For a quick production-resolution sample, scan five evenly spaced content pages
per document:

```powershell
& .\infra\upload-api\local_trial\run-structure-audit.ps1 `
  -InputPath "C:\full\path\to\folder" `
  -Dpi 600 `
  -SamplePagesPerDocument 5
```

Use `-SamplePagesPerDocument 0` (the default) to scan every content page.

## Run the complete revised pipeline

After changing district resolution or row classification, run a single
production-equivalent pass over the original PDFs:

```powershell
& .\infra\upload-api\local_trial\run-fix-validation.ps1 `
  -InputPath "C:\full\path\to\folder" `
  -ElectionName "The exact election label submitted with the batch"
```

This uses the production 600 dpi colour OCR settings, evidence-only row
recovery that never creates an elector solely from a numeric gap, two-scale
fallback for missing or clipped page-header codes, and row-eligibility
filtering. Always pass the exact election label from the batch:
it selects the same aggregate election-family eligibility fallback used by
production when a cover legend is unreadable. The label itself is not written
to the aggregate report. The row extractor locates the printed vertical
column rules, requires numeric candidates to begin inside the narrow ENO band,
repairs OCR-damaged ordinary numbers only where readable anchors support the
repair, and preserves spatially anchored high-number and slash-number late
additions. Dates printed over names and house numbers outside the ENO band are
rejected. It processes full pages, so it takes materially longer than the
header audit. The same privacy boundary applies: Docker networking is disabled,
the source folder is read-only, and elector rows remain in memory. The saved
report contains only aggregate counts and the final `PASS` or `WITHHOLD`
quality-gate decision. When the selected folder also contains supported XLSX
inputs, they are parsed in the same isolated run and included in the aggregate
cross-source deduplication, vote, and postal-vote totals.

Do not release a result unless:

- every PDF has trusted page-level district resolution;
- no blank, `UNKNOWN`, `DISTRICT`, or `DIVISION` district remains; and
- within-source deduplication is at or below 2%.
