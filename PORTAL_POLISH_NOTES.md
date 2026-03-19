## Summary of changes

- Added local government data-quality indicators so Warwickshire is explicitly marked as manually verified and every other authority is either shown as unverified or missing composition data.
- Added a verification banner to the Local Government index and composition-review callouts to non-Warwickshire local authority detail pages.
- Decluttered portal navigation by collapsing lower-priority analytics links behind a persistent `More analytics` toggle stored in `localStorage`.
- Added plain-English `How this works` methodology disclosures to Reform Threat, Lib Dem Threat, and Green Threat pages, including a non-predictive disclaimer and top-seat explanation.
- Improved constituency detail summary chips by:
  - surfacing Reform Threat rank alongside Lib Dem and Green where present
  - making LGR-affected seats more prominent with an amber summary badge
  - adding an expandable marginality explanation
- Added a Local Government Intelligence / LGR tracker mention to the public homepage product section.
- Verified that the scenario modeller route and navigation are already present and loading from the current branch baseline.

## Files changed

- `src/components/ThreatMethodologyDisclosure.jsx`
- `src/components/ThreatMethodologyDisclosure.test.jsx`
- `src/index.css`
- `src/pages/Home.jsx`
- `src/pages/portal/PortalLayout.jsx`
- `src/pages/portal/PortalLayout.test.jsx`
- `src/pages/portal/constituency/ConstituencyDetail.jsx`
- `src/pages/portal/constituency/GreenThreatPage.jsx`
- `src/pages/portal/constituency/LibDemThreatPage.jsx`
- `src/pages/portal/constituency/ReformThreatIndex.jsx`
- `src/pages/portal/constituency/constituencyApi.js`
- `src/pages/portal/constituency/constituencyApi.test.js`
- `src/pages/portal/local-government/LocalGovDetail.jsx`
- `src/pages/portal/local-government/LocalGovIndex.jsx`
- `src/pages/portal/local-government/localGovQuality.js`
- `src/pages/portal/local-government/localGovQuality.test.js`

## Commands run

- `git checkout main`
- `git pull origin main`
- `git checkout -b portal-polish-and-data-quality`
- `npm run test:run`
- `npm run test:run -- src/pages/portal/Uploads.test.jsx`
- `npm run test:run`
- `npm run build`

## Test results

- `npm run test:run` final run passed
- `77` test files passed
- `285` tests passed
- `npm run build` passed

## Notes / unresolved dependencies

- The first full-suite test run hit transient timeout failures in `src/pages/portal/Uploads.test.jsx`, but the file passed in isolation and the subsequent full-suite rerun passed cleanly.
- Non-Warwickshire local government composition quality is currently inferred from the brief and current data shape rather than an explicit `source_type` column. That means all non-Warwickshire composition data is treated as pending verification, which is the safest demo posture until source metadata is formalised.
- LGR constituency badges currently match linked authority names against `lgr_authorities` records using normalized authority names. That is appropriate for the current dataset, but exact-key joins would be better if `lgr_authorities` later gains stable authority IDs or GSS codes.
- Existing build chunk warnings remain, especially around the main app bundle and constituency map asset bundle.
