# Task 02: Import the authoritative brand assets

Follow `00-shared-rules.md`.

## Objective

Copy the approved 2026 brand assets into the repository without wiring them into application code or changing any rendered page.

## Source

`C:\Users\pauls\OneDrive\Documents\Claude\Projects\Political Knowledge Base\Brand`

Inspect `README - Logo usage.md` and `website-handover/POLITICAL_SOLUTIONS_DESIGN_SYSTEM.md` as reference material. User instructions in this task pack override conflicting text.

## Work

- Copy the outlined light, dark, no-strapline, and mark SVGs needed by public pages into `src/assets/brand/`.
- Copy the website-handover favicon, touch icon, square logo, and social-card assets into `public/` using stable names.
- Copy `website-handover/POLITICAL_SOLUTIONS_DESIGN_SYSTEM.md` to the existing repository file `POLITICAL_SOLUTIONS_DESIGN_SYSTEM.md`.
- Record each source-to-destination mapping in `docs/public-site-copy/brand-asset-manifest.md`.
- Do not change imports, HTML head tags, CSS, JSX, or existing assets yet.
- Do not delete the old logo or Proxima Nova files in this task.

## Verification

- Pass 1: compare byte hashes between every copied source and destination; validate SVG parsing, viewBox presence, and raster dimensions.
- Pass 2: reopen every destination independently, visually inspect the principal lockups and icons, and confirm the source Brand folder is unchanged.

Fail explicitly if any asset is missing, corrupted, renamed ambiguously, or cannot be read.
