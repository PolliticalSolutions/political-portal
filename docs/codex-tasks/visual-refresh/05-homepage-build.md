# Task 05: Build the approved homepage

Follow `00-shared-rules.md`.

## Prerequisites

The homepage copy and production imagery must both have explicit user approval. If either approval is missing, stop and ask.

## Objective

Implement the six-section public homepage using the approved copy, selected imagery, imported brand assets, and public shell.

## Sections

1. Operational hero with one primary CTA.
2. Asymmetric three-product choice, not three identical cards.
3. Dark product-proof interruption.
4. Experience and verified delivery proof.
5. Continuous scope-to-handover process.
6. Decisive closing CTA.

## Constraints

- Implement the design in React and project CSS. Do not embed generated full-page mockups.
- Do not show fabricated portal screens, unavailable services, or unverified claims. Product proof must use verified working functionality or an honest non-UI visual.
- Preserve all destinations, enquiry parameters, commerce behaviour, analytics, SEO components, and accessibility semantics.
- Use compact geometry, restrained motion, reduced-motion support, one primary action per section, and logical heading order.
- Limit edits to homepage-specific code, public shared components already approved for reuse, and public-scoped CSS.

## Verification

- Pass 1: homepage/component tests, link and heading checks, asset checks, accessibility scan where available, and `npm run build`.
- Pass 2: fresh desktop/mobile browser review of every section, keyboard navigation, focus states, reduced motion, image cropping, overflow, visual hierarchy, and comparison with the approved copy and imagery.

