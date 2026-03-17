# Pre-Demo Notes

## Branch

- `pre-demo-ui-fixes`

## Files changed

- `src/index.css`
- `src/data/products.js`
- `src/pages/Home.jsx`
- `src/pages/Services.jsx`
- `src/pages/EnquirePage.jsx`
- `src/pages/Subscriptions.jsx`
- `src/pages/Cart.jsx`
- `src/pages/Checkout.jsx`
- `src/pages/portal/PortalLayout.jsx`
- `src/pages/portal/Dashboard.jsx`
- `src/pages/portal/PricingRules.jsx`
- `src/pages/portal/Integrations.jsx`
- `src/pages/portal/Uploads.jsx`
- `src/pages/portal/Quotes.jsx`
- `src/pages/portal/admin/ManualReviewPage.jsx`
- `src/pages/portal/constituency/ConstituencyIndex.jsx`
- `src/pages/portal/constituency/ConstituencyDetail.jsx`
- `src/pages/Services.test.jsx`
- `src/pages/EnquirePage.test.jsx`
- `src/pages/Subscriptions.test.jsx`
- `src/pages/portal/Dashboard.test.jsx`
- `src/pages/portal/PortalRouting.test.jsx`
- `src/pages/portal/PricingRules.test.jsx`
- deleted: `src/pages/__snapshots__/Subscriptions.test.jsx.snap`

## What was completed

- Removed visible prototype cues from the portal and Constituency Intelligence.
- Reframed the homepage around the two-product model:
  - `Marked Register Processing`
  - `Constituency Intelligence`
- Productised the Constituency Intelligence index and detail screens with:
  - a proper page header
  - shared filter styling
  - shared tables
  - a summary strip
  - portal-style tabs
- Standardised portal page headers, field styling, small actions, and table treatments across:
  - uploads
  - pricing rules
  - quotes
  - manual review
  - integrations
- Restructured the dashboard into:
  - Marked Register Processing
  - Constituency Intelligence
  - Account and subscriptions
- Normalised pricing/purchase naming around:
  - `Association subscriptions`
  - `Marked Register Processing`
- Added process explainer copy to cart and checkout.
- Tightened the services and enquiry copy and added clearer CTA ownership.
- Replaced the dense portal mobile nav with grouped workflow navigation below `768px`.

## Decisions made that need review

- Constituency Intelligence still routes prospective users to the enquiry flow rather than a dedicated public product page. This was the smallest sensible pre-demo change without creating a new marketing route.
- The dashboard current-selection note shows the most specific saved item first. If a constituency is present, it is shown instead of the broader association label.
- Portal nav workflow groups are:
  - `Products`
  - `Account`
  - `Admin`
  `Services` remains in the `Account` group for now to avoid adding another workflow cluster before the demo.
- Pricing Rules remains available in the portal, but its framing now treats it as account/pricing administration rather than a public pricing destination.

## Not completed and why

- No large structural rewrite was attempted for public trust/content surfaces outside the requested priorities.
- No new dedicated public page for Constituency Intelligence was added.
- No database, Supabase, AWS, Amplify, swing-calculation, or data-import changes were made, per instruction.

## Still needs doing before the demo

- Browser QA across desktop, tablet, and mobile on the updated portal nav and Constituency Intelligence pages.
- Copy review by the CEO/commercial lead to confirm tone and buyer language for CCHQ.
- Performance cleanup remains advisable:
  - large hero PNG assets are still present
  - the constituency map bundle is still very large
  - Vite still reports oversized chunks during production build
- A final visual pass on remaining lower-priority portal/admin surfaces such as quote detail would still be worthwhile if time allows.

## Verification run

- `npm run test:run`
  - passed: `50` test files, `201` tests
- `npm run build`
  - passed
  - remaining warning: large client/map chunks still exceed Vite warning threshold
