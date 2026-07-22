# Local OCR gap-inference trial

This runner compares the legacy marked-register parser with the default-off
Defect C candidate without using AWS or the live portal.

## Privacy boundary

- The selected PDF is mounted read-only into a local Docker container.
- The container has networking disabled while it processes the register.
- Elector rows and OCR text remain in memory and are not printed or saved.
- The only saved file is an aggregate JSON report. It contains counts, declared
  district/range diagnostics, and baseline-versus-candidate differences.
- The report does not contain the input path, source filename, elector numbers,
  names, addresses, or OCR line text.

Do not commit the selected PDF or anything written under
`infra/upload-api/local-trial-output/`.

## Run the trial

1. Start Docker Desktop and wait until it reports that the engine is running.
2. Open PowerShell in the repository.
3. Run:

```powershell
& .\infra\upload-api\local_trial\run-gap-trial.ps1 `
  -PdfPath "C:\full\path\to\register.pdf"
```

The first run reuses the Linux Python packages from the SAM build and builds a
local image containing Python 3.12, Tesseract and Poppler. The PDF is then
OCR'd twice at 600dpi in colour with two cover pages skipped and 20-page chunks,
matching the relevant production settings.

The report is written to `infra/upload-api/local-trial-output/`. It compares:

- rows before and after deduplication;
- `Voted=Y` and `Voted=N` totals;
- unique base-number counts;
- base numbers in consecutive marked runs of five or more, and the longest run;
- numeric-gap rows the legacy parser would generate;
- visually evidenced strikethrough rows inferred;
- declared-numbering counts, without elector-number lists.

## Limitations

The trial uses the same Python parser but locally installed Docker versions of
Tesseract and Poppler. OCR output can therefore differ slightly from the Lambda
layer. Treat this as acceptance evidence for the gap-inference behavior, not as
a byte-for-byte reproduction of AWS OCR.
