# Task 12: Correct the legal identity and public legal pages

Follow `00-shared-rules.md`.

## Objective

Remove every public-facing reference to **Political Solutions Ltd**, apply the correct legal/trading-name treatment, and align `/privacy`, `/terms`, and `/cookies` visually with the public site.

## Naming rule

- Normal public references: **Political Solutions**.
- Formal identification of the contracting company, data controller, or legal entity: **Startin Sales Solutions Ltd, trading as Political Solutions**.
- Never use **Political Solutions Ltd**.

## Requirements

- Search public components, legal pages, metadata, footer content, and relevant tests for the old name.
- Do not rewrite substantive legal obligations, rights, liability, payment terms, retention rules, or consent language merely for tone.
- Verify any company number, registered address, controller status, or other formal detail from an authoritative existing source. If required information is missing or conflicting, stop and ask the user; do not infer it.
- Improve structure, headings, readability, and navigation without weakening the legal meaning.
- Keep auth, portal, campaign, API, and data-handling behaviour untouched.

## Verification

- Pass 1: legal-page tests, exact-name searches, link/email checks, semantic heading checks, and `npm run build`.
- Pass 2: independent line-by-line comparison to ensure only approved nomenclature and presentational changes affected legal meaning; browser review at desktop/mobile.

