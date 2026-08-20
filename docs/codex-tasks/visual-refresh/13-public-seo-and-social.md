# Task 13: Align public SEO and social presentation

Follow `00-shared-rules.md`.

## Objective

Align metadata, structured data, public icons, and social previews with the approved public copy and 2026 brand assets.

## Requirements

- Audit only included public routes for unique titles, descriptions, canonicals, robots treatment, Open Graph, Twitter cards, structured data, sitemap inclusion, and prerendering.
- Use **Political Solutions** as the brand name and **Startin Sales Solutions Ltd** as `legalName` only where the schema formally requires the legal entity.
- Keep square schema-logo assets separate from the 1200×630 social card.
- Use the authoritative Brand assets without stretching, recolouring, rebuilding, or adding effects.
- Do not alter protected-route content, indexing policy, authentication, or portal metadata.
- If a global head change would visibly alter a protected route and cannot be safely scoped, stop and ask rather than assuming permission.

## Verification

- Pass 1: SEO, sitemap, robots, prerender, asset-dimension, and structured-data tests plus `npm run build`.
- Pass 2: independently inspect generated HTML for every included public route, verify absolute URLs and image assets, then perform a fresh browser/source review of representative routes.

Do not test a deployed social scraper or change external caches; deployment is out of scope.

