# Preamble

## Audit scope

This audit reviews the implemented UI in the Political Solutions repository as the source of truth. It assesses the public marketing site, the blog, the portal, the Marked Register workflow, and the Constituency Intelligence product against the standard required for a credible commercial political operations platform aimed at senior UK Conservative Party professionals.

The audit is judged against five commercial realities:

1. The platform must look trustworthy within seconds.
2. The user must understand what the platform sells without decoding internal terminology.
3. The public site and portal must feel like one coherent product.
4. Constituency Intelligence must look like a real commercial data product, not an internal prototype.
5. Every recommendation must be specific enough to implement without a follow-up question.

Throughout this report:

- `Confirmed defect` means an issue that is directly visible from the current implementation.
- `Improvement opportunity` means a judgement call or strategic enhancement rather than a hard defect.

## Routes and components reviewed

### Route structure reviewed

- Public routes from [src/App.jsx](C:/Users/pauls/Documents/political-portal/src/App.jsx):
  - `/` via [src/pages/Home.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Home.jsx)
  - `/services` via [src/pages/Services.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Services.jsx)
  - `/services/election-support` via [src/pages/ServiceSupport.jsx](C:/Users/pauls/Documents/political-portal/src/pages/ServiceSupport.jsx)
  - `/enquire` via [src/pages/EnquirePage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/EnquirePage.jsx)
  - `/blog` via [src/pages/BlogIndexPage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/BlogIndexPage.jsx)
  - `/blog/:slug` via [src/pages/BlogPostPage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/BlogPostPage.jsx)
  - `/login` via [src/pages/Login.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Login.jsx)
  - `/signup` via [src/pages/SignUp.jsx](C:/Users/pauls/Documents/political-portal/src/pages/SignUp.jsx)
  - `/cart` via [src/pages/Cart.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Cart.jsx)
  - `/checkout` via [src/pages/Checkout.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Checkout.jsx)

### Portal routes reviewed

- [src/pages/portal/PortalLayout.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/PortalLayout.jsx)
- [src/pages/portal/Dashboard.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Dashboard.jsx)
- [src/pages/portal/PricingRules.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/PricingRules.jsx)
- [src/pages/Subscriptions.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Subscriptions.jsx)
- [src/pages/portal/Integrations.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Integrations.jsx)
- [src/pages/portal/Uploads.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Uploads.jsx)
- [src/pages/portal/Quotes.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Quotes.jsx)
- [src/pages/portal/admin/ManualReviewPage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/admin/ManualReviewPage.jsx)

### Constituency Intelligence reviewed

- [src/pages/portal/constituency/ConstituencyIndex.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/constituency/ConstituencyIndex.jsx)
- [src/pages/portal/constituency/ConstituencyDetail.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/constituency/ConstituencyDetail.jsx)
- [src/pages/portal/constituency/ConstituencyMapClient.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/constituency/ConstituencyMapClient.jsx)

### Shared UI foundations reviewed

- [src/index.css](C:/Users/pauls/Documents/political-portal/src/index.css)
- [src/components/Button.jsx](C:/Users/pauls/Documents/political-portal/src/components/Button.jsx)
- [src/components/Card.jsx](C:/Users/pauls/Documents/political-portal/src/components/Card.jsx)
- [src/components/Badge.jsx](C:/Users/pauls/Documents/political-portal/src/components/Badge.jsx)
- [src/components/AssociationSelector.jsx](C:/Users/pauls/Documents/political-portal/src/components/AssociationSelector.jsx)
- [src/components/CartSummary.jsx](C:/Users/pauls/Documents/political-portal/src/components/CartSummary.jsx)
- [src/components/Footer.jsx](C:/Users/pauls/Documents/political-portal/src/components/Footer.jsx)
- [src/components/CookieNotice.jsx](C:/Users/pauls/Documents/political-portal/src/components/CookieNotice.jsx)
- [src/pages/Subscriptions.css](C:/Users/pauls/Documents/political-portal/src/pages/Subscriptions.css)
- [src/pages/Cart.css](C:/Users/pauls/Documents/political-portal/src/pages/Cart.css)
- [src/pages/Checkout.css](C:/Users/pauls/Documents/political-portal/src/pages/Checkout.css)

---

# 1. Executive Summary

Overall UI quality is mixed. The public site has a recognisable base style, a usable spacing system, and a respectable colour palette, but it does not yet communicate a premium political data product with enough clarity or authority. The portal is functionally serviceable but visually inconsistent, too reliant on inline styling, and too often reads as a collection of internal admin screens rather than a polished commercial SaaS product. Constituency Intelligence is the sharpest example of this gap: functionally promising, visually undercooked.

The biggest strengths are the relatively disciplined global foundation in [src/index.css](C:/Users/pauls/Documents/political-portal/src/index.css), the shared `Button`, `Card`, and `Badge` primitives, and the fact that public pages broadly use a clean blue-and-gold institutional palette rather than startup gimmicks. The biggest weaknesses are product clarity, portal polish, and consistency. The site still does not explain the two products cleanly enough on the homepage, pricing and purchase flows are split across multiple mental models, and too many high-value screens use raw controls, dense tables, and ad hoc layout logic that immediately lowers perceived quality.

Blunt commercial answer: this is not yet credible enough to demo to CCHQ as a finished commercial platform. It is credible enough to show privately as a capable product in development, but not polished enough for a high-stakes sales or institutional trust moment. The three things that must change first are:

1. Clarify the product architecture on the public-facing pages so a senior political buyer instantly understands the difference between Marked Register processing and Constituency Intelligence.
2. Bring the portal and Constituency Intelligence screens up to a consistent product standard by replacing admin-style raw controls, dense inline-styled layouts, and prototype signals with one shared UI language.
3. Tighten commercial credibility by rewriting generic copy, simplifying navigation, and making the conversion path from homepage to enquiry, subscription, or portal action far more direct.

---

# 2. Design Direction Statement

Political Solutions should present as an institutional, operational, commercially serious political data platform. The visual tone should feel closer to a high-trust professional intelligence or compliance product than a startup marketing site. That means restraint, clarity, and authority rather than decorative flourish.

## Visual tone

The platform should feel:

- serious rather than friendly
- premium rather than improvised
- operational rather than promotional
- controlled rather than ad hoc

The current blue, white, slate, and muted gold palette is the right starting point. It already suggests political professionalism and can support this tone. What is missing is discipline. The same palette should be used consistently across public pages, portal dashboards, admin workflows, and Constituency Intelligence so the whole system feels like one product family.

## Typography approach

Typography should establish a clear hierarchy with no page-specific improvisation unless absolutely necessary.

- `H1` should remain a strong commercial headline style on public pages.
- Portal page titles should not be visually downgraded into small card titles. They need a proper product-page title style that still feels subordinate to public-page heroes.
- `H2` and `H3` should be standardised for section and card heading use rather than repeatedly overridden inline.
- Body text should be slightly darker in more places. The current heavy reliance on `.muted` makes too much of the interface look low-emphasis.
- Long-form reading surfaces such as blog posts should use more deliberate typography and line spacing so they feel like authority content rather than neutral markdown output.

## Colour usage

The palette should be systematised into:

- one core brand navy for primary actions and headings
- one restrained gold accent for signals of importance, not frequent decoration
- one surface scale for white and subtle grey cards
- one semantic system for success, warning, and error states

Raw browser-default greys and arbitrary inline colours should be removed from product-facing flows. Status colours should be consistent across uploads, manual review, checkout, integrations, and constituency screens.

## Spacing system

The spacing system in [src/index.css](C:/Users/pauls/Documents/political-portal/src/index.css) is broadly workable and should remain the foundation. The platform should standardise:

- public section rhythm using existing `--space-*` tokens
- card padding across all portal/product pages
- filter/control spacing in data interfaces
- table-to-card spacing
- CTA spacing and footer spacing

Inline one-off spacing values should be reduced sharply. Right now the portal feels less professional largely because layout rhythm is improvised route by route.

## Component language

Every page should use the same product language for:

- buttons
- cards
- form fields
- badges
- tables
- filters
- tabs
- alerts/status banners
- empty states

Public pages can be slightly more spacious and narrative-driven, but not visually unrelated. Portal pages and Constituency Intelligence should feel like the same system in a denser operational mode, not a separate internal back office.

In practice, this means:

- all form controls should use shared styled classes rather than raw HTML defaults
- all tab systems should match the platform button/colour/spacing language
- all data tables should have one standard density and overflow pattern
- all empty/loading/error states should use consistent card and status components
- all portal screens should stop relying on freeform inline styling for structure

This should become the standard future work is measured against: one disciplined, institutional UI language expressed differently across public marketing, portal workflows, and intelligence tooling, but never fragmented into separate visual dialects.

---

# 3. High-Priority Issues

## Issue 1

- `Type`: Confirmed defect
- `Where`: Homepage and broader public product positioning. [src/pages/Home.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Home.jsx)
- `Problem`: The homepage does not clearly separate the two products. It presents “UK political operations platform” language, service language, support language, and generic operational capability language, but it does not quickly tell a senior buyer: “Product 1 is Marked Register processing. Product 2 is Constituency Intelligence. Here is what each one does, who it is for, and what to do next.”
- `Why it matters commercially`: A CCHQ staffer, chairman, or candidate will not give the platform the benefit of the doubt. If the homepage forces them to infer the offer, it immediately feels underpositioned and amateur.
- `Specific fix required`: Redesign the homepage information architecture so the hero and first two sections explicitly separate the two products. Add one short product-definition block for Marked Register processing and one for Constituency Intelligence, each with:
  - product name
  - one-sentence operational benefit
  - who it is for
  - one primary CTA
  - one trust-supporting proof point or scope statement

## Issue 2

- `Type`: Confirmed defect
- `Where`: Portal-wide visual consistency. [src/pages/portal/PortalLayout.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/PortalLayout.jsx), [src/pages/portal/Dashboard.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Dashboard.jsx), [src/pages/portal/Uploads.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Uploads.jsx), [src/pages/portal/Quotes.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Quotes.jsx), [src/pages/portal/admin/ManualReviewPage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/admin/ManualReviewPage.jsx)
- `Problem`: The portal relies heavily on inline styles, browser-default form controls, and table-first admin layouts. This makes it feel like an internal tool rather than a sellable product.
- `Why it matters commercially`: Senior political buyers will judge the competence of the data product by the finish of the interface. Internal-tool aesthetics suggest weak product maturity, weak QA, and weak operational control.
- `Specific fix required`: Standardise the portal into one visual system by:
  - replacing raw `input`, `select`, `textarea`, and bare `button` usage with shared styled components or shared `.input` / `.button` classes
  - introducing shared portal page header, filter bar, table, and status-banner patterns
  - removing route-specific inline typography and spacing overrides where a shared class should exist
  - applying the same density and card style across dashboard, uploads, quotes, manual review, and pricing rules

## Issue 3

- `Type`: Confirmed defect
- `Where`: Constituency Intelligence surface. [src/pages/portal/constituency/ConstituencyIndex.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/constituency/ConstituencyIndex.jsx), [src/pages/portal/constituency/ConstituencyDetail.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/constituency/ConstituencyDetail.jsx), [src/pages/portal/constituency/ConstituencyMapClient.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/constituency/ConstituencyMapClient.jsx)
- `Problem`: Constituency Intelligence currently looks prototype-grade. The map, side statistics, filters, and tables are functional but not productised. The detail page also contains a “coming soon” councils tab with a civic emoji, which is a clear prototype signal.
- `Why it matters commercially`: This is the newest product and the one least likely to receive trust if it looks unfinished. A prototype look will cause senior stakeholders to question the reliability of the data beneath it.
- `Specific fix required`: Before demoing to CCHQ:
  - restyle the index page into a proper data-product landing surface with a stronger page header, a more structured search/filter bar, and more deliberate map framing
  - standardise all filters and tables to shared product styles
  - redesign the detail tab bar to match the rest of the portal
  - remove the emoji-based placeholder and replace it with a plain, commercial “Data not yet available” panel
  - introduce stronger data hierarchy on the detail page with a proper summary strip for winner, majority, election, electorate, and region

## Issue 4

- `Type`: Confirmed defect
- `Where`: Public copy and CTA hierarchy. [src/pages/Services.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Services.jsx), [src/pages/EnquirePage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/EnquirePage.jsx), [src/pages/Home.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Home.jsx)
- `Problem`: Several public pages use generic, awkward, or diluted copy. “What services do we offer?” is not strong commercial headline copy. The enquiry page copy is wordy and generic. The services page overexplains process but underexplains product value.
- `Why it matters commercially`: Copy quality is a trust signal. Senior political professionals will infer product maturity from wording. Generic or clumsy language makes the platform look less serious.
- `Specific fix required`: Rewrite public page copy to:
  - lead with operational outcomes, not generic service descriptions
  - remove filler phrasing
  - standardise product naming
  - make each page answer one buyer question clearly
  - give each page one dominant CTA and one secondary CTA maximum

## Issue 5

- `Type`: Confirmed defect
- `Where`: Pricing and purchase journey. [src/pages/Subscriptions.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Subscriptions.jsx), [src/pages/portal/PricingRules.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/PricingRules.jsx), [src/pages/Checkout.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Checkout.jsx), [src/pages/Cart.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Cart.jsx)
- `Problem`: Pricing is split across a polished-ish subscription page and a much more operational portal pricing-rules view. To the team this is understandable; to a buyer it is fragmented. Public pricing feels like a product-selection flow, while pricing rules feel like a back-office calculator.
- `Why it matters commercially`: Price clarity is one of the fastest ways to build or lose trust. If the platform looks unsure about where real pricing lives, buyers will assume the product is not commercially settled.
- `Specific fix required`: Reframe pricing into one coherent model:
  - public-facing subscription page should be the commercial pricing surface
  - pricing rules should be repositioned as a detailed calculation or admin breakdown, not a competing pricing destination
  - checkout should use the same terminology as subscriptions and pricing
  - if pricing rules must remain, add clear explanatory framing that this is a detailed internal breakdown of the selected commercial package

## Issue 6

- `Type`: Confirmed defect
- `Where`: Mobile portal navigation. [src/index.css](C:/Users/pauls/Documents/political-portal/src/index.css), [src/pages/portal/PortalLayout.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/PortalLayout.jsx)
- `Problem`: At narrower breakpoints the portal nav becomes a horizontal auto-flow strip. With the current number of items, this is visually dense, cognitively heavy, and likely awkward to use on mobile or small tablet.
- `Why it matters commercially`: A dense, hard-to-scan navigation strip is a strong “internal tool” signal and makes the portal feel operationally messy.
- `Specific fix required`: Replace the horizontal scrolling portal nav with a mobile-specific navigation pattern:
  - either a stacked grouped menu panel or a compact section selector
  - group items by workflow
  - reduce top-level options visible at once
  - distinguish commercial product actions from admin actions

## Issue 7

- `Type`: Confirmed defect
- `Where`: Performance-linked visual perception. [src/pages/Home.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Home.jsx), [src/pages/Services.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Services.jsx), [src/pages/EnquirePage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/EnquirePage.jsx), [src/pages/portal/constituency/ConstituencyMapClient.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/constituency/ConstituencyMapClient.jsx), [vite.config.js](C:/Users/pauls/Documents/political-portal/vite.config.js)
- `Problem`: The public site uses oversized PNG assets around 1MB to 1.9MB, and Constituency Intelligence bundles a roughly 1.47MB GeoJSON directly into the client. The build already warns about a large main bundle.
- `Why it matters commercially`: Slow or heavy-feeling UI reduces perceived quality even if the interface looks acceptable. That risk is especially serious for a data product being shown in demos.
- `Specific fix required`: Treat this as a UI-quality issue, not just engineering housekeeping:
  - convert large public illustrations to optimised formats and responsive sizes
  - lazy-load or simplify constituency boundary data further
  - keep the map isolated from core product flows
  - reduce the likelihood that the first meaningful paint feels heavy on lower-powered devices or poor connections

---

# 4. Medium-Priority Issues

## Issue 1

- `Type`: Confirmed defect
- `Where`: Public-to-portal homogeny. [src/pages/Home.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Home.jsx), [src/pages/portal/Dashboard.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Dashboard.jsx)
- `Problem`: Public pages feel more intentionally composed than portal pages. The dashboard in particular is structurally sparse and visually generic.
- `Why it matters commercially`: The shift from polished marketing to plain portal lowers confidence after sign-in.
- `Specific fix required`: Introduce a proper portal landing page structure with a stronger title area, clearer workflow groupings, and visually prioritised primary actions.

## Issue 2

- `Type`: Confirmed defect
- `Where`: Language inconsistency across Marked Register product naming. [src/pages/Home.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Home.jsx), [src/pages/Services.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Services.jsx), [src/pages/Subscriptions.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Subscriptions.jsx), [src/pages/portal/Uploads.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Uploads.jsx)
- `Problem`: The same product is referred to as “Marked Register processing”, “Marked Register Entry”, and “upload files” depending on context.
- `Why it matters commercially`: Inconsistent naming weakens buyer comprehension and makes the product feel loosely defined.
- `Specific fix required`: Choose one product name for the monetised service and one label for the upload action. Use them consistently across homepage, services, subscriptions, cart, checkout, and portal.

## Issue 3

- `Type`: Confirmed defect
- `Where`: Services page CTA structure. [src/pages/Services.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Services.jsx)
- `Problem`: The page lists three services, then uses one full-width enquiry CTA without distinguishing which product or use case the user is choosing.
- `Why it matters commercially`: It weakens hierarchy. Users know they should “do something” but not what path best fits them.
- `Specific fix required`: Give each service block a direct CTA and keep one overall enquiry CTA at the bottom. Make the primary action for Marked Register processing distinct from election support and consultancy.

## Issue 4

- `Type`: Confirmed defect
- `Where`: Pricing rules screen controls. [src/pages/portal/PricingRules.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/PricingRules.jsx)
- `Problem`: This page uses raw buttons and raw form controls rather than the shared UI system, making it look visibly out of family with subscriptions.
- `Why it matters commercially`: It looks like an internal calculation page bolted onto a customer-facing product.
- `Specific fix required`: Restyle pricing rules with the same field, button, and card language used in subscriptions. Keep it visually subordinate to commercial pricing, not parallel with it.

## Issue 5

- `Type`: Confirmed defect
- `Where`: Blog visual authority. [src/pages/BlogIndexPage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/BlogIndexPage.jsx), [src/pages/BlogPostPage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/BlogPostPage.jsx)
- `Problem`: The blog is clean but visually plain. It does not currently feel like a serious political intelligence publication.
- `Why it matters commercially`: For this audience, authority content is a trust mechanism. The current blog presentation is serviceable but not reputation-building.
- `Specific fix required`: Upgrade blog templates with:
  - stronger editorial hierarchy
  - more deliberate article metadata presentation
  - clearer reading width and section rhythm
  - more distinctive index cards with category or product relevance cues

## Issue 6

- `Type`: Improvement opportunity
- `Where`: Footer and site-wide trust framing. [src/components/Footer.jsx](C:/Users/pauls/Documents/political-portal/src/components/Footer.jsx)
- `Problem`: The footer is tidy but light on institutional trust signals.
- `Why it matters commercially`: This audience wants signs of seriousness, accountability, and UK-wide professional coverage.
- `Specific fix required`: Expand the footer to include a more deliberate company/trust block, clearer product links, and one succinct trust/operational assurance section.

## Issue 7

- `Type`: Confirmed defect
- `Where`: Dashboard and portal-first onboarding. [src/pages/portal/Dashboard.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Dashboard.jsx)
- `Problem`: The dashboard does not help users understand the difference between tools, what to do next, or where the primary product workflows begin.
- `Why it matters commercially`: A first-time logged-in user should feel guided, not dropped into a list of unrelated cards.
- `Specific fix required`: Rework dashboard content into product-oriented modules:
  - Marked Register processing
  - Constituency Intelligence
  - subscriptions/billing
  - support and administration

---

# 5. Low-Priority Issues

## Issue 1

- `Type`: Improvement opportunity
- `Where`: Cookie banner. [src/components/CookieNotice.jsx](C:/Users/pauls/Documents/political-portal/src/components/CookieNotice.jsx)
- `Problem`: The banner is serviceable but visually generic and slightly abrupt relative to the rest of the site.
- `Why it matters commercially`: It does not undermine trust, but it feels more default than designed.
- `Specific fix required`: Align banner styling, copy tone, and button treatment more tightly with the core interface.

## Issue 2

- `Type`: Improvement opportunity
- `Where`: Login and sign-up surfaces. [src/pages/Login.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Login.jsx), [src/pages/SignUp.jsx](C:/Users/pauls/Documents/political-portal/src/pages/SignUp.jsx)
- `Problem`: These pages are sparse and functional but not especially polished.
- `Why it matters commercially`: They are not high-risk screens, but stronger framing would reinforce product maturity.
- `Specific fix required`: Add concise role-appropriate explanatory copy and better contextual framing of what users get after authentication.

## Issue 3

- `Type`: Improvement opportunity
- `Where`: Cart and checkout microcopy. [src/pages/Cart.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Cart.jsx), [src/pages/Checkout.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Checkout.jsx)
- `Problem`: The flow is reasonably structured but could feel more commercial and less operationally literal.
- `Why it matters commercially`: It does not stop use, but it does not add confidence either.
- `Specific fix required`: Tighten wording and add one short reassurance block explaining commercial process, billing, and next steps.

## Issue 4

- `Type`: Improvement opportunity
- `Where`: Badge language and emphasis use. [src/components/Badge.jsx](C:/Users/pauls/Documents/political-portal/src/components/Badge.jsx), [src/pages/Subscriptions.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Subscriptions.jsx)
- `Problem`: Badge usage is acceptable but not fully systematised. It does not yet communicate a deliberate semantic language.
- `Why it matters commercially`: Minor, but contributes to “assembled” rather than “designed” feel.
- `Specific fix required`: Formalise badge use for recommendations, product type, status, and compliance context.

---

# 6. Page-by-Page Findings

## Home

- `Current state`: The homepage uses the strongest visual composition in the product, with a clear hero, decent section rhythm, and a controlled institutional palette. It reads as a general political operations platform, not yet as a sharply defined two-product commercial offer.
- `Confirmed problems`:
  - Product differentiation is weak. The page never quickly separates Marked Register processing from Constituency Intelligence.
  - The hero says “UK political operations platform for clean delivery”, which is competent but too generic for a sceptical political buyer.
  - Multiple sections describe capability, delivery, trust, and resources in a way that overlaps conceptually.
  - The primary CTA “Request support” is service-led rather than product-led.
- `Implementation-ready recommendations`:
  - Rewrite the hero around the commercial offer: two product lines, one sentence each, one primary CTA based on the highest-value immediate action.
  - Replace the current “Core services” section with two clearly framed product cards and one services/support card.
  - Remove or consolidate overlapping capability sections so the page explains products once, trust once, and next steps once.
  - Add one evidence/trust strip tailored to political professionals: scope clarity, operational handling, and buyer relevance.

## Services

- `Current state`: The page is functional but generic. It looks like a static services list with one big enquiry CTA.
- `Confirmed problems`:
  - “What services do we offer?” is a weak H1 for this audience.
  - The three service descriptions vary in specificity and tone.
  - Marked Register service language is process-heavy and user-journey-heavy rather than value-led.
  - The CTA hierarchy is blunt: one large enquiry button, little route guidance.
- `Implementation-ready recommendations`:
  - Change the page headline to a commercial outcome-oriented statement.
  - Rewrite each service card to answer: what it is, who it is for, when to choose it.
  - Add product-specific CTAs within each card.
  - Keep the compliance note but visually subordinate it beneath the primary commercial story.

## Service Support

- `Current state`: Structurally clear, but visually underpowered and slightly placeholder-like.
- `Confirmed problems`:
  - The hero visual literally says “Campaign delivery snapshot” and “Operational support visual placeholder”, which reads as unfinished.
  - The enquiry form is usable but visually plain.
  - The page is honest about scope, but the overall impression is more admin form than commercial service page.
- `Implementation-ready recommendations`:
  - Replace the placeholder hero visual with a real product-support visual or remove it.
  - Strengthen the service framing with one “what happens next” timeline.
  - Improve the form presentation with better sectional grouping and stronger reassurance about response and scope.

## Enquire

- `Current state`: Functional enquiry flow with useful field coverage and organisation selector.
- `Confirmed problems`:
  - Introductory copy is too long, generic, and awkwardly phrased.
  - The page asks users to “highlight which services offered you're interested in” but does not help them decide.
  - The hero is structurally consistent with the site but commercially soft.
- `Implementation-ready recommendations`:
  - Rewrite the intro into concise buyer guidance.
  - Group service options into clearer categories aligned to products and support.
  - Add one short expectation-setting panel: response time, what to include, and what happens after submission.

## Blog index

- `Current state`: Clean list of published posts with titles, dates, descriptions, and tags.
- `Confirmed problems`:
  - The page is visually plain and generic.
  - It lacks stronger editorial framing or relevance to the two products.
  - It does not currently look like a distinctive authority resource for political professionals.
- `Implementation-ready recommendations`:
  - Add a stronger editorial intro framing the blog as operational guidance for campaign professionals.
  - Improve card hierarchy and metadata styling.
  - Add category or product relevance labels so the content feels tied to the commercial platform.

## Blog post

- `Current state`: Readable markdown article layout with tags, date, author, and optional comments.
- `Confirmed problems`:
  - Typography is functional but not especially polished.
  - There is little visual distinction between article body, article metadata, and support content.
  - Comments depend on Giscus and are visually generic.
- `Implementation-ready recommendations`:
  - Increase article-specific typographic hierarchy and spacing.
  - Add a more distinctive article header block.
  - Make inline citation and source presentation feel more authoritative and editorial.

## Login

- `Current state`: Minimal and functional sign-in card.
- `Confirmed problems`:
  - The screen is competent but sparse.
  - It does not reinforce product trust or explain what the user will reach beyond a short line.
- `Implementation-ready recommendations`:
  - Keep the simplicity, but add one product-specific reassurance block.
  - Add clearer copy for portal users by role where appropriate.

## Sign Up

- `Current state`: Functional but very light account-creation page.
- `Confirmed problems`:
  - It looks like a utility page rather than part of a premium product.
  - Pricing context is shown, but the surrounding framing is thin.
- `Implementation-ready recommendations`:
  - Add stronger context around what account creation unlocks.
  - Improve visual hierarchy of captured pricing context and next-step choices.

## Cart

- `Current state`: Clear enough list-and-summary layout using shared card styling.
- `Confirmed problems`:
  - Commercial reassurance is limited.
  - The page does not clearly explain whether this is a purchase, quote request, invoice request, or subscription request until later in the flow.
- `Implementation-ready recommendations`:
  - Add a short process explainer at top or in summary card.
  - Ensure wording matches checkout exactly.

## Checkout

- `Current state`: Functional request form with sensible validation and summary.
- `Confirmed problems`:
  - It still feels operationally literal rather than premium.
  - Some field grouping could be clearer.
  - The distinction between quote request, invoice request, and subscription process is still slightly convoluted.
- `Implementation-ready recommendations`:
  - Group fields into contact, organisation, billing, and compliance sections.
  - Add one clear statement explaining what happens after submission.
  - Simplify the copy around invoice and quote behaviour.

## Portal dashboard

- `Current state`: Sparse set of cards linking to pricing and support.
- `Confirmed problems`:
  - It does not establish the portal as a serious operational product.
  - It has no strong sense of product overview, current status, or recommended next step.
  - The primary action is unclear.
- `Implementation-ready recommendations`:
  - Rebuild the dashboard around product workflows and user roles.
  - Add a primary panel for Marked Register processing and a secondary one for Constituency Intelligence.
  - Group admin and support actions separately from product actions.

## Pricing rules

- `Current state`: Functional calculator-style detail page with print/save affordance.
- `Confirmed problems`:
  - Visually inconsistent with the subscriptions page.
  - Raw controls and plain buttons make it look like a support tool, not customer-facing product UI.
  - Commercial role in the journey is unclear.
- `Implementation-ready recommendations`:
  - Reframe as a detailed calculation page for selected organisations.
  - Restyle it to the same standard as subscriptions.
  - Make the relationship to commercial pricing explicit.

## Subscriptions

- `Current state`: One of the better portal/public hybrid flows. It has stronger composition, defined tier cards, and a clearer CTA model.
- `Confirmed problems`:
  - The visual style of the tier cards is stronger than the rest of the portal, which actually makes the rest of the portal feel more unfinished by contrast.
  - The relationship between subscription capability and Marked Register add-ons is not as instantly clear as it should be.
  - Some content is still dense for a time-poor buyer.
- `Implementation-ready recommendations`:
  - Keep this as the benchmark for portal polish.
  - Tighten content density and product explanations.
  - Clarify how Marked Register processing and subscriptions relate commercially.

## Integrations

- `Current state`: Functional Xero admin page.
- `Confirmed problems`:
  - It reads like a developer/admin utility page rather than a polished business integration surface.
  - Uses generic cards and raw status messaging.
- `Implementation-ready recommendations`:
  - Add integration-state hierarchy with clearer summaries and semantic status treatments.
  - Group actions and explanatory content into a more polished settings pattern.

## Uploads

- `Current state`: Functionally solid and operationally useful upload workflow.
- `Confirmed problems`:
  - It looks like an internal upload queue rather than a premium core product flow.
  - The raw status badge styling, table layout, and inline form control styling are not aligned with the rest of the interface.
  - This is the live monetised product, but it does not currently look like the flagship product.
- `Implementation-ready recommendations`:
  - Promote this page to a first-class product workflow with a proper page header, step framing, and clearer upload state design.
  - Standardise form controls and tables.
  - Add clearer stage messaging: select files, define election context, upload, monitor processing, download results.

## Quotes

- `Current state`: Functional list screen with filtering and table output.
- `Confirmed problems`:
  - It is operational but visually dry.
  - Table hierarchy is acceptable but generic.
  - It fits admin users more than commercial or support users.
- `Implementation-ready recommendations`:
  - Introduce a shared data-table pattern with better summary blocks and filters.
  - Improve status styling for quote type and Xero state.

## Manual review

- `Current state`: Functional admin queue screen.
- `Confirmed problems`:
  - It looks explicitly like an internal admin page rather than part of a polished product.
  - It relies heavily on raw table UI and raw form controls.
  - It is visually disconnected from the rest of the portal.
- `Implementation-ready recommendations`:
  - Restyle it using the same product system as uploads and quotes.
  - Convert the queue and detail forms into one consistent review workflow pattern.

---

# 7. Constituency Intelligence — Specific Findings

Current verdict: Constituency Intelligence currently looks like a promising prototype, not a finished commercial data product.

## What is working

- The core concept is commercially strong.
- There is a sensible information split between index and detail.
- Lazy loading the map is technically correct.
- The detail page does expose useful analytical material such as election history, demographic comparisons, and candidate history.

## What makes it feel prototype-grade

### Map presentation

- The map is functional but not framed as a premium analytic asset.
- It sits inside a generic card with no strong supporting context or explanatory hierarchy.
- The fill-only choropleth style is readable but visually flat.

### Side stats

- The “Overview” and “Seats won” cards are useful but feel secondary and visually basic.
- There is little product-level storytelling around what the user should do with this information.

### Filter controls

- Search and filter controls are inline-styled and visually plain.
- They look more like quick utility filters than a deliberate product search interface.

### Table density and readability

- The constituency results table is clear enough on desktop but visually utilitarian.
- It risks feeling like a database export view rather than a commercial intelligence product.

### Detail tabs

- The tab bar in [src/pages/portal/constituency/ConstituencyDetail.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/constituency/ConstituencyDetail.jsx) uses a separate inline-styled visual language not shared elsewhere.
- This breaks homogeny with the rest of the product.

### Placeholder signal

- The councils tab uses a civic emoji and a “coming soon” treatment. That is acceptable during development, but not acceptable in a high-trust demo.

### Mobile degradation

- The index layout uses a fixed two-column grid and large map container with no dedicated small-screen treatment.
- Tables and filters are likely manageable but not elegant on mobile.
- The map does not currently appear to have a mobile-specific interaction or fallback design.

### Consistency with the rest of the portal

- It is inconsistent with the rest of the portal but not in a flattering way. It does not feel more premium than the portal; it feels like a separate prototype surface built with direct inline layout logic.

## Does it look like a commercial data product?

Not yet. It looks like a working internal beta. A technically competent internal stakeholder may see its potential. A commercial buyer or CCHQ stakeholder would see promise, but also visible unfinishedness.

## What must change before a CCHQ demo

1. Give Constituency Intelligence a proper product-level visual identity inside the portal:
   - stronger page header
   - polished search/filter bar
   - structured summary cards
   - consistent table and tab styles
2. Remove all prototype cues:
   - no emoji placeholders
   - no “coming soon” styling that feels informal
   - no raw utility-looking control layouts
3. Make the detail page read like a serious intelligence report:
   - stronger summary strip
   - more deliberate tab hierarchy
   - cleaner data comparison presentation
   - tighter spacing and typography

---

# 8. Design System Findings

## What shared system exists today

There is a genuine base design system:

- colour palette and spacing tokens in [src/index.css](C:/Users/pauls/Documents/political-portal/src/index.css)
- shared `Button`, `Card`, and `Badge`
- a coherent public-page section and hero pattern
- standard card radius, borders, shadows, and button treatment

This is enough to support a coherent platform if used consistently.

## Where it breaks down

- Portal pages often bypass the system through inline styles.
- Several key pages use raw `input`, `select`, `textarea`, and `button` elements without `.input` or `.button` styling.
- Table styles are ad hoc by page.
- Tabs in Constituency Intelligence are bespoke and disconnected.
- Status messaging is not systematised across uploads, integrations, checkout, and admin screens.

## What reusable patterns are missing

- portal page header pattern
- shared filter bar pattern
- shared product table pattern
- shared empty/loading/error-state blocks for data screens
- shared tabs pattern
- shared settings/admin workflow pattern
- stronger content/authority pattern for blog and knowledge content

## What needs standardising

- field styling for every form control
- status and alert colours
- card header sizing in portal pages
- table density, spacing, border treatment, and overflow handling
- CTA grouping patterns
- dashboard and settings section structure

---

# 9. Accessibility Findings

## Heading hierarchy

- `Confirmed defect`
- `Where`: multiple portal pages including [src/pages/portal/Dashboard.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Dashboard.jsx), [src/pages/portal/PricingRules.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/PricingRules.jsx), [src/pages/portal/Uploads.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Uploads.jsx)
- `Finding`: Card titles are frequently `h3` by component, while pages manually inject `h1` or visually styled divs inconsistently. Portal pages do not have a stable semantic page-heading pattern.
- `Recommendation`: Introduce one standard semantic page-title region per route and use card titles only for subordinate sections.

## Form labelling

- `Confirmed defect`
- `Where`: [src/pages/ServiceSupport.jsx](C:/Users/pauls/Documents/political-portal/src/pages/ServiceSupport.jsx), [src/pages/Checkout.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Checkout.jsx), [src/pages/portal/Uploads.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Uploads.jsx), [src/components/AssociationSelector.jsx](C:/Users/pauls/Documents/political-portal/src/components/AssociationSelector.jsx)
- `Finding`: Some controls are well labelled, but there are nested labels, ad hoc label patterns, and raw control groupings that are less robust than they should be.
- `Recommendation`: Standardise explicit `label`/`htmlFor` patterns for all controls and avoid nested label structures for checkbox groups where a fieldset/legend pattern is more appropriate.

## Contrast and overuse of muted text

- `Confirmed defect`
- `Where`: site-wide via `.muted` usage in [src/index.css](C:/Users/pauls/Documents/political-portal/src/index.css)
- `Finding`: Too much body copy is rendered in muted colour, including commercially important explanatory copy.
- `Recommendation`: Reserve muted text for secondary metadata. Use stronger text colour for key content, especially commercial explanations and form guidance.

## Keyboard interaction

- `Improvement opportunity`
- `Where`: data-heavy screens and the dropzone in [src/pages/portal/Uploads.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Uploads.jsx)
- `Finding`: There is some keyboard support, but custom controls and table-heavy screens need more consistent focus behaviour and clearer focus visibility in dense contexts.
- `Recommendation`: Ensure all custom interactive elements use standard focus and keyboard semantics, and test dense portal screens end to end by keyboard only.

## Tap targets and mobile nav

- `Confirmed defect`
- `Where`: top navigation and portal navigation. [src/index.css](C:/Users/pauls/Documents/political-portal/src/index.css), [src/pages/portal/PortalLayout.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/PortalLayout.jsx)
- `Finding`: Top nav is acceptable, but portal nav becomes dense and horizontally awkward on smaller screens.
- `Recommendation`: Introduce a mobile-specific portal navigation pattern rather than relying on dense horizontal nav pills.

## Tables and overflow

- `Confirmed defect`
- `Where`: uploads, quotes, manual review, constituency index, election history. [src/pages/portal/Uploads.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Uploads.jsx), [src/pages/portal/Quotes.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Quotes.jsx), [src/pages/portal/admin/ManualReviewPage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/admin/ManualReviewPage.jsx), [src/pages/portal/constituency/ConstituencyIndex.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/constituency/ConstituencyIndex.jsx), [src/pages/portal/constituency/ConstituencyDetail.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/constituency/ConstituencyDetail.jsx)
- `Finding`: Overflow handling exists, but the experience is still table-first and not especially accessible or comfortable on smaller screens.
- `Recommendation`: Introduce a responsive data presentation pattern with either stacked rows at narrow widths or a more deliberate mobile summary layout.

---

# 10. Conversion and Commercial Findings

## Overall commercial position

- The site is commercially plausible, but not yet commercially sharp.
- The public site contains enough substance to suggest a real business.
- The portal contains enough working functionality to suggest a real product.
- The problem is that the journey between those two things is not clean enough, polished enough, or unified enough for a sceptical senior political buyer.

## Product differentiation

- `Confirmed defect`
- `Where`: [src/pages/Home.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Home.jsx), [src/pages/Services.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Services.jsx)
- `Finding`: The platform has two products, but the public presentation does not separate them crisply enough. A visitor has to infer the distinction rather than being shown it immediately.
- `Recommendation`: Present Marked Register processing and Constituency Intelligence as two explicit offer tracks from the first fold onward, each with its own buyer, value proposition, and CTA.

## Pricing actionability

- `Confirmed defect`
- `Where`: [src/pages/Subscriptions.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Subscriptions.jsx), [src/pages/portal/PricingRules.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/PricingRules.jsx), [src/pages/Cart.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Cart.jsx), [src/pages/Checkout.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Checkout.jsx)
- `Finding`: Pricing exists, but it is split between public subscription purchase and internal-looking pricing rules. That makes commercial logic feel operationally fragmented.
- `Recommendation`: Create one clear commercial pricing narrative on the public side, and keep rules/configuration clearly behind the scenes inside the portal.

## Trust signals

- `Improvement opportunity`
- `Where`: site-wide, especially [src/pages/Home.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Home.jsx), [src/components/Footer.jsx](C:/Users/pauls/Documents/political-portal/src/components/Footer.jsx), [src/pages/BlogIndexPage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/BlogIndexPage.jsx)
- `Finding`: The site signals competence, but not quite authority. It needs more evidence of operational seriousness: real outputs, real process clarity, and stronger product framing.
- `Recommendation`: Add higher-trust proof points such as example outputs, more concrete process summaries, clearer “who this is for” framing, and a stronger authority treatment for the blog.

## Enquiry and purchase path clarity

- `Confirmed defect`
- `Where`: [src/pages/Home.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Home.jsx), [src/pages/Services.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Services.jsx), [src/pages/EnquirePage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/EnquirePage.jsx), [src/pages/Subscriptions.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Subscriptions.jsx)
- `Finding`: There are multiple legitimate next steps, but they are not always ordered by buyer intent. Users can enquire, subscribe, log in, or browse services, but the best path for each product is not consistently foregrounded.
- `Recommendation`: Assign one primary CTA per page and one secondary CTA only. Make each CTA product-specific rather than generic.

## Would it stand up to scrutiny from journalists or senior party staff?

Partially. It would survive a functional walkthrough. It would not yet survive close scrutiny on polish, cohesion, and seriousness of presentation. The risk is not that it looks fake. The risk is that it looks mid-build.

## User journey mapping

### Journey 1: By-election candidate landing on the homepage

- `Entry point`: [src/pages/Home.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Home.jsx)
- `First moment of clarity`: There is a legitimate political data/campaign operations offering here.
- `First moment of confusion`: It is not immediately obvious whether the main offer is campaign data consulting, marked register processing, software subscriptions, or constituency intelligence.
- `Primary CTA path today`: hero CTA -> services/subscriptions/enquiry depending on interpretation
- `Friction points`:
  - mixed product messaging in the hero
  - services framed more broadly than the two-product model
  - weak “start here if you are running a by-election” signposting
- `Likely drop-off`: after the first scroll if the user cannot quickly identify the exact service relevant to an urgent campaign problem
- `Precise fix required`: Turn the homepage hero and first two sections into a simple two-lane choice: “Process a Marked Register” and “Explore Constituency Intelligence”, with a third lower-priority lane for broader support/enquiry.

### Journey 2: Association chairman wanting Marked Register processing

- `Entry point`: homepage, services page, or direct recommendation into the portal
- `First moment of clarity`: the uploads workflow in [src/pages/portal/Uploads.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Uploads.jsx) is real and operationally useful
- `First moment of confusion`: before reaching that workflow, the product naming and purchase path are not clean enough
- `Primary CTA path today`: public pages -> subscriptions/cart/checkout or enquire
- `Friction points`:
  - subscription language and processing language are not unified
  - pricing rules exist as a visible concept inside the portal even though they are operational detail
  - uploads page does not look like the flagship paid workflow
- `Likely drop-off`: between public interest and paid commitment, because the value-to-purchase path feels procedural rather than commercial
- `Precise fix required`: Build one explicit public path for Marked Register processing with clear explanation, price logic, and direct CTA into purchase or account setup; then make the uploads screen feel like the premium core product it is.

### Journey 3: CCHQ researcher wanting constituency data

- `Entry point`: homepage or direct login into the portal
- `First moment of clarity`: the Constituency Intelligence index shows that a searchable database exists
- `First moment of confusion`: it does not yet look finished enough to inspire confidence in a high-stakes institutional buyer
- `Primary CTA path today`: homepage -> login/portal or indirect discovery through product sections
- `Friction points`:
  - no strong public-facing explanation of the database as a distinct premium product
  - index and detail pages look prototype-grade
  - tabs and tables feel internally built rather than commercially designed
- `Likely drop-off`: on first visual impression of the constituency product, before deeper trust is established
- `Precise fix required`: Give Constituency Intelligence a proper product narrative publicly and a premium, standardised data-product UI inside the portal before any CCHQ-facing demo.

### Journey 4: First-time visitor trying to understand what the platform does

- `Entry point`: homepage
- `First moment of clarity`: it is related to political campaign data and operations
- `First moment of confusion`: the boundary between services, software, subscriptions, and specialist products is blurred
- `Primary CTA path today`: read, scroll, then choose between services, enquiry, login, or subscription
- `Friction points`:
  - too much interpretation required
  - generic service wording weakens precision
  - blog supports authority but does not strongly feed a conversion path
- `Likely drop-off`: after reading enough to know it is credible, but not enough to know what to buy next
- `Precise fix required`: Rewrite the information architecture around explicit product choices, sharper audience targeting, and clearer page-level CTA ownership.

---

# 11. Recommended Implementation Plan

## Pre-demo fixes

1. Reframe the homepage around the two-product model.
   - Rewrite the hero and first supporting sections in [src/pages/Home.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Home.jsx) so a buyer can choose immediately between Marked Register processing and Constituency Intelligence.
   - Add one primary CTA per product and demote generic exploration links.
2. Bring Constituency Intelligence to commercial demo standard.
   - Replace ad hoc inline styling in [src/pages/portal/constituency/ConstituencyIndex.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/constituency/ConstituencyIndex.jsx) and [src/pages/portal/constituency/ConstituencyDetail.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/constituency/ConstituencyDetail.jsx) with a consistent product page header, filter bar, tabs, summary cards, and table treatment.
   - Remove the emoji “coming soon” cue from the councils tab.
3. Standardise portal controls and page structure.
   - Build one shared portal header/filter/form/table language and apply it first to uploads, pricing rules, quotes, integrations, and manual review.
4. Simplify the pricing story.
   - Keep public pricing and subscription purchase in one commercially understandable flow.
   - Reframe portal pricing rules as administrative configuration, not buyer-facing pricing explanation.
5. Rewrite generic or awkward marketing copy.
   - Tighten [src/pages/Services.jsx](C:/Users/pauls/Documents/political-portal/src/pages/Services.jsx) and [src/pages/EnquirePage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/EnquirePage.jsx) so the copy sounds operational, specific, and politically literate.
6. Fix portal navigation on smaller screens.
   - Replace dense horizontal pill navigation in [src/pages/portal/PortalLayout.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/PortalLayout.jsx) with a mobile-safe navigation pattern.
7. Remove visible prototype cues and raw-control styling.
   - Standardise browser-default inputs/selects/textareas and informal placeholder treatments across the portal.

## Structural improvements

1. Build a real portal design system layer on top of the current global stylesheet.
   - Shared page headers
   - shared table pattern
   - shared filter pattern
   - shared tabs
   - shared status/alert treatments
2. Create a consistent naming model.
   - Standardise product and workflow terminology across marketing pages, checkout, subscriptions, and portal screens.
3. Rework the dashboard around role and product tasks.
   - Make the dashboard in [src/pages/portal/Dashboard.jsx](C:/Users/pauls/Documents/political-portal/src/pages/portal/Dashboard.jsx) orient users toward the right next action by role.
4. Improve blog authority presentation.
   - Upgrade [src/pages/BlogIndexPage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/BlogIndexPage.jsx) and [src/pages/BlogPostPage.jsx](C:/Users/pauls/Documents/political-portal/src/pages/BlogPostPage.jsx) so the content reads as institutional expertise, not just a clean article template.
5. Rationalise CTA placement and duplication site-wide.
   - One primary CTA per page, one secondary CTA at most, and clearer routing by user intent.

## Polish

1. Upgrade login and sign-up framing so they feel like part of a premium platform, not a generic auth flow.
2. Strengthen the footer with better product segmentation, trust links, and route signposting.
3. Formalise badge and semantic status colours across the system.
4. Refine cookie notice and secondary support-page presentation so they match the rest of the product more cleanly.

---

# 12. Suggested Order of Work

1. `Clarify the two-product offer on the homepage`
   - `Why this order`: It fixes the highest-value commercial confusion at the top of the funnel.
   - `Effort`: medium
   - `Must do before demo`
2. `Bring Constituency Intelligence to commercial UI standard`
   - `Why this order`: It is the area most likely to undermine confidence with CCHQ despite having strong underlying value.
   - `Effort`: large
   - `Must do before demo`
3. `Standardise portal controls and remove raw admin-style UI`
   - `Why this order`: The portal currently looks less premium than the public site and damages trust once users log in.
   - `Effort`: large
   - `Must do before demo`
4. `Unify pricing architecture and wording`
   - `Why this order`: Buyers need a clean path from understanding to purchase without operational/internal terminology getting in the way.
   - `Effort`: medium
   - `Must do before demo`
5. `Rewrite services and enquiry copy in operational language`
   - `Why this order`: Better wording improves trust quickly and reduces perceived vagueness without requiring major engineering work.
   - `Effort`: medium
   - `Must do before demo`
6. `Restructure the portal dashboard around products and roles`
   - `Why this order`: A clearer dashboard improves orientation for every logged-in user.
   - `Effort`: medium
   - `Must do before demo`
7. `Fix portal mobile navigation`
   - `Why this order`: It prevents the portal from feeling brittle on smaller devices and reduces navigation friction immediately.
   - `Effort`: medium
   - `Must do before demo`
8. `Introduce shared data-table and filter patterns`
   - `Why this order`: This removes visual drift across uploads, quotes, manual review, and constituency screens.
   - `Effort`: large
   - `Must do before demo`
9. `Remove prototype and placeholder signals`
   - `Why this order`: Small changes such as removing emoji and informal placeholders yield immediate credibility gains.
   - `Effort`: small
   - `Must do before demo`
10. `Reduce oversized hero media and map-payload perception`
   - `Why this order`: Performance is part of trust; slower first impressions make the product feel heavier and less polished.
   - `Effort`: medium
   - `Must do before demo`
11. `Create one consistent portal heading and page-header pattern`
   - `Why this order`: It strengthens structure and hierarchy across the whole application.
   - `Effort`: medium
12. `Improve blog authority styling`
   - `Why this order`: This strengthens trust and thought-leadership value, but it is less urgent than fixing core product surfaces.
   - `Effort`: medium
13. `Strengthen accessibility and form semantics`
   - `Why this order`: Important for quality and usability across all audiences, though less likely than the issues above to lose a senior buyer in the first minute.
   - `Effort`: medium
14. `Expand footer trust and product signposting`
   - `Why this order`: Helpful for orientation and credibility, but secondary to fixing the core journeys.
   - `Effort`: small
15. `Formalise badge, status, and semantic colour rules`
   - `Why this order`: This improves overall coherence and reduces visual noise across the portal.
   - `Effort`: small
