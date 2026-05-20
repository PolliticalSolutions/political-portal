# Weekly council composition sync

Run the council composition import from Open Council Data UK.

## Steps

1. Check that `SUPABASE_SERVICE_KEY` is available — read from `.env` at the repo root or from the environment. If it is not set, stop and tell the user to set it before proceeding.

2. From the repo root, run:
   ```
   python scripts/import_council_composition.py
   ```

3. Report the key numbers from the import summary:
   - English councils parsed
   - Composition updates (matched)
   - council_data rows written
   - Any insert or patch errors

4. If `council_data rows written` is 0 and the schema check passed, flag it — something is wrong with the data pipeline.

5. Confirm the run completed without errors. If there were errors, show the full error output and suggest a fix.
