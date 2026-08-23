# Task 14: Final public-site QA and bounded fixes

Follow `00-shared-rules.md`.

## Objective

Perform a ruthless final audit of every included public route and fix only defects within the approved public-site scope.

## Audit matrix

- Brand assets, Archivo, palette, spacing, typography, responsive layout, and image treatment.
- Approved copy fidelity, company naming, factual claims, prices, product availability, and CTA destinations.
- Keyboard navigation, focus, headings, landmarks, labels, errors, contrast, reduced motion, and mobile usability.
- Loading, empty, validation, failure, success, purchase, and confirmation states.
- SEO, structured data, canonical URLs, social images, prerender output, sitemap, and robots.
- Performance basics: asset sizes, image dimensions, lazy loading, layout shift, console errors, and broken requests.

## Protected-scope proof

- Use the diff to prove auth, portal, campaign, backend, database, infrastructure, permissions, and payment logic were not changed.
- If a public defect requires protected-scope work, report it separately and ask; do not fix it in this task.

## Verification

- Pass 1: full relevant test suite, production build, static searches for obsolete names/assets/fonts/brand colours, and browser matrix at 1440×900 and 390×844.
- Pass 2: begin from a fresh build and browser session; repeat the complete route matrix without relying on Pass 1 notes, inspect console/network output, and recheck the final diff against every task's acceptance criteria.

Any defect found in Pass 2 requires an in-scope fix followed by both full passes again. Finish with a route-by-route evidence table and no commit, push, or deployment.

