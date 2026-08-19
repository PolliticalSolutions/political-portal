# Product-page copy specification

**Status:** `DRAFT — USER APPROVAL REQUIRED`

This document specifies copy only for `/services`, `/constituency-intelligence`, and
`/services/election-support`. It does not authorise changes to application code, styling,
routes, forms, product behaviour, pricing, structured data or metadata.

The offer hierarchy in this revision follows Paul Startin's current LinkedIn positioning:
data-led campaign management and consultancy is the lead offer; Constituency Intelligence and
Marked Register Processing are distinct data capabilities that support evidence-led campaign
work. LinkedIn is used here as an owner-controlled positioning source, not as independent proof of
performance statistics or service outcomes.

## 1. Page roles and action hierarchy

| Route | Page job | Primary conversion action | Secondary action |
|---|---|---|---|
| `/services` | Introduce the consultancy-led offer, distinguish the three service lines and route visitors to the right next step. | **Discuss your campaign** → `/enquire?service=election-support` | Product-specific links are local navigation, not competing page-level actions. |
| `/constituency-intelligence` | Show how verified constituency evidence can inform campaign planning and invite a scoped conversation. | **Discuss your constituencies** → `/enquire?service=constituency-intelligence` | **Explore campaign support** → `/services/election-support` |
| `/services/election-support` | Present campaign management and consultancy as the lead service, explain how engagements are scoped and collect a usable brief. | **Send campaign-support enquiry** → existing inline form submission | **Use the general enquiry form** → `/enquire?service=election-support` |

The three service lines must remain distinct even when they are used together:

- **Campaigning, Training & Election Support** is separately scoped consultancy and practical
  support. It can cover campaign management, strategy, candidate coaching, association support,
  officer mentoring, volunteer briefings and agreed delivery work. It is not portal functionality
  and is not included automatically in a platform subscription.
- **Constituency Intelligence** is a permission-based portal workspace for constituency evidence
  and analysis. It supports planning; it is not campaign management or a promise of an electoral
  result.
- **Marked Register Processing** is a portal workflow for submitting marked-register files,
  monitoring processing and downloading a released result. It is a data-processing capability,
  not the whole Political Solutions offer.

## 2. `/services`

### Page objective

Lead with Political Solutions' data-led campaign management and consultancy offer, then show how
the support, intelligence and processing service lines address different parts of campaign work.

### Hero

**Eyebrow**

> Campaign services

**Heading**

> Campaign support built on evidence, not assumption

**Lead**

> Political Solutions provides data-led campaign management and consultancy for Conservative associations, candidates, councillors and council groups. The offer brings together campaign planning and strategy, candidate coaching and association support, with constituency intelligence and marked-register processing available as distinct data capabilities.

**Primary CTA**

> Discuss your campaign

Destination: `/enquire?service=election-support`

### Service overview

**Section heading**

> Start with the campaign job in front of you

#### Service 1: Campaigning, Training & Election Support

**Description**

> Bring Political Solutions into a defined campaign job or an ongoing working relationship for campaign management, strategy, candidate coaching, association support and agreed delivery work. Scope, timing and price are confirmed before work begins.

**Audience**

> For Conservative associations, candidates, councillors, council groups and campaign teams that need hands-on support.

**Service link**

> Explore campaign support

Destination: `/services/election-support`

#### Service 2: Constituency Intelligence

**Description**

> Review election history, demographics, swing analysis, vulnerability scores and party-specific threat indices for the constituencies your organisation can access.

**Audience**

> For associations and campaign teams comparing constituencies and planning from seat-level evidence.

**Service link**

> Explore Constituency Intelligence

Destination: `/constituency-intelligence`

#### Service 3: Marked Register Processing

**Description**

> Submit marked-register files through the portal for processing, monitor the batch and download any released result from the same workflow.

**Audience**

> For agents, association officers and campaign teams handling marked-register returns.

**Service link**

> Enquire about processing

Destination: `/enquire?service=marked-register`

### Service boundaries

**Section heading**

> Three distinct jobs, one evidence-led approach

**Campaign management and consultancy**

> Campaigning, Training & Election Support is agreed directly with Political Solutions. It covers only the work, timing and responsibilities confirmed in the scope.

**Constituency evidence**

> Constituency Intelligence provides election and demographic evidence for permitted constituencies. Access follows the user's organisation and permissions.

**Marked-register workflow**

> Marked Register Processing handles file submission, processing status and any released result through the portal.

### Frequently asked questions

**Section heading**

> Service questions

**Question**

> Can Political Solutions support a campaign beyond the immediate election period?

**Answer**

> Yes. Political Solutions offers retained campaign planning, data and standing strategic support across the electoral cycle. The scope and commercial terms are agreed separately.

**Question**

> Is campaign support included in a platform subscription?

**Answer**

> No. Campaigning, Training & Election Support is scoped and charged separately. Political Solutions confirms the work and price before delivery begins.

**Question**

> Can every user view every constituency?

**Answer**

> No. Portal access is tied to the user's organisation and the constituencies assigned through its permissions.

### Closing CTA

**Heading**

> Build the campaign before the final weeks

**Body**

> Tell us about the organisation, campaign or electoral challenge you are working on. We will confirm whether campaign support, constituency intelligence, marked-register processing or a combination is the right next step.

**Primary CTA**

> Discuss your campaign

Destination: `/enquire?service=election-support`

### SEO copy

**Title value in `seoRoutes.js`**

> Data-led campaign management and consultancy

**Rendered title**

> Data-led campaign management and consultancy | Political Solutions

**Meta description**

> Campaign management, strategy, candidate coaching and association support for Conservative associations and campaign teams.

## 3. `/constituency-intelligence`

### Page objective

Position Constituency Intelligence as evidence for campaign planning, set accurate access
expectations and generate conversations about the constituencies a team needs to review.

### Hero

**Eyebrow**

> Constituency Intelligence

**Heading**

> Know the ground before you plan the campaign

**Lead**

> Bring election history, demographics, swing analysis, vulnerability scores and party-specific threat indices into the decisions that shape your campaign.

**Audience**

> For Conservative associations and campaign teams comparing the constituencies they are permitted to access.

**Primary CTA**

> Discuss your constituencies

Destination: `/enquire?service=constituency-intelligence`

**Secondary CTA**

> Explore campaign support

Destination: `/services/election-support`

### Evidence in the workspace

**Section heading**

> Move from election history to campaign context

**Introductory copy**

> Start with recorded election results and demographic context, then review swing, vulnerability and party-specific threat analysis at constituency level.

#### Evidence area 1

**Heading**

> Election history

**Body**

> Review recorded election results and compare the electoral history held for a constituency.

#### Evidence area 2

**Heading**

> Demographic context

**Body**

> Use 2021 Census data alongside constituency election evidence.

#### Evidence area 3

**Heading**

> Swing analysis

**Body**

> Review recorded swing between election pairs and compare it with national context.

#### Evidence area 4

**Heading**

> Vulnerability and party-specific threat

**Body**

> Review vulnerability scores and Reform UK, Liberal Democrat and Green Party threat indices.

### Role in campaign work

**Section heading**

> Evidence for the decisions made before polling day

**Body**

> Constituency Intelligence brings the constituency evidence held by Political Solutions into one workspace for planning and comparison. It supports campaign judgement; it does not replace separately scoped campaign management or promise an electoral outcome.

### Access

**Section heading**

> Access follows your organisation's permissions

**Body**

> Portal access is tied to the user's organisation and permitted constituencies. Request a conversation to confirm coverage and onboarding for your team.

### Closing CTA

**Heading**

> Discuss the constituencies that matter to your campaign

**Body**

> Tell us about your organisation, the relevant constituencies and who needs access. We will confirm the appropriate next step.

**Primary CTA**

> Discuss your constituencies

Destination: `/enquire?service=constituency-intelligence`

**Secondary CTA**

> Explore campaign support

Destination: `/services/election-support`

### SEO copy

**Title value in `seoRoutes.js`**

> Constituency intelligence for campaign planning

**Rendered title**

> Constituency intelligence for campaign planning | Political Solutions

**Meta description**

> Use election history, demographics, swing, vulnerability and party-specific threat analysis to inform planning for permitted constituencies.

## 4. `/services/election-support`

### Page objective

Present Political Solutions' campaign management and consultancy offer as the primary service,
explain the boundary between a defined engagement and the data products, and collect enough
information to assess a brief.

### Hero

**Eyebrow**

> Campaigning, Training & Election Support

**Heading**

> Data-led campaign management across the electoral cycle

**Lead**

> Political Solutions works with Conservative associations, candidates, councillors and council groups on campaign planning and strategy, candidate coaching, association support and practical delivery.

**Audience**

> For teams that want ongoing or defined support built on electoral evidence rather than assumption.

No primary hero button is proposed. The existing inline form is the page's primary conversion
action.

**Secondary link**

> Use the general enquiry form

Destination: `/enquire?service=election-support`

### Engagement model

**Section heading**

> Support shaped around the campaign

**Body**

> Support can be scoped for a defined campaign job or retained across the electoral cycle. Political Solutions confirms the organisation, relevant constituencies, requirements, timing, responsibilities and price before work begins.

**Support area**

> Campaign management and strategy

**Supporting copy**

> Agree the campaign objective, scope, responsibilities, timing and delivery requirements.

**Support area**

> Candidate coaching

**Supporting copy**

> Include candidate coaching where it forms part of the agreed campaign scope.

**Support area**

> Association and council-group support

**Supporting copy**

> Retained or defined support can cover campaign planning, data and standing strategic advice across the electoral cycle.

**Support area**

> Officer mentoring and volunteer briefings

**Supporting copy**

> Association-officer mentoring and volunteer briefings can be scoped around the people, purpose and practical information involved.

**Support area**

> Data coordination

**Supporting copy**

> Confirm the inputs, ownership and handovers required for the agreed work.

**Support area**

> Print logistics and delivery oversight

**Supporting copy**

> Define the materials, responsibilities and delivery checkpoints within the agreed scope.

### Data relationship

**Section heading**

> Data underpins the work; the services remain distinct

**Body**

> Political Solutions' campaign work is informed by electoral data. Constituency Intelligence and Marked Register Processing remain distinct services with their own access, workflow and commercial arrangements; neither is automatically included in a campaign-support engagement.

### Compliance boundary

**Section heading**

> Client responsibilities remain with the campaign

**Body**

> Clients remain responsible for compliance with electoral law and regulated spending. Political Solutions does not provide statutory electoral services.

### Enquiry form

**Section ID for implementation**

`campaign-support-enquiry`

**Heading**

> Tell us about the campaign

**Introductory copy**

> Give us enough detail to understand the organisation, electoral challenge and support you want to discuss. We will use your brief to confirm scope and next steps.

**Field labels**

- `Name *`
- `Email *`
- `Phone`
- `Organisation`
- `Campaign-support brief`

**Brief helper text**

> Include the relevant constituencies, timing and work you want scoped.

The campaign-support brief remains optional because the current form validation does not require a
message. The implementation task must not change that behaviour without separate approval.

**Consent label**

> I agree to be contacted about this enquiry.

**Primary submit action**

> Send campaign-support enquiry

Behaviour: submit through the existing inline enquiry workflow.

**Secondary text link**

> Use the general enquiry form

Destination: `/enquire?service=election-support`

**Success message**

> Thank you. Your campaign-support enquiry has been sent.

**Error message**

> Something went wrong. Please email paul@politicalsolutions.uk directly.

Email destination: `mailto:paul@politicalsolutions.uk`

### SEO copy

**Title value in `seoRoutes.js`**

> Data-led political campaign management

**Rendered title**

> Data-led political campaign management | Political Solutions

**Meta description**

> Discuss campaign management, strategy, candidate coaching, association support and practical delivery with Political Solutions.

## 5. CTA and route validation table

| Copy label | Destination or behaviour | Evidence |
|---|---|---|
| Discuss your campaign | `/enquire?service=election-support` | `src/pages/EnquirePage.jsx:22-25`; `src/pages/EnquirePage.test.jsx:115-127` |
| Explore campaign support | `/services/election-support` | `src/App.jsx:505` |
| Explore Constituency Intelligence | `/constituency-intelligence` | `src/App.jsx:504` |
| Discuss your constituencies | `/enquire?service=constituency-intelligence` | `src/pages/EnquirePage.jsx:22-25`; `src/pages/EnquirePage.test.jsx:90-101` |
| Enquire about processing | `/enquire?service=marked-register` | `src/pages/EnquirePage.jsx:22-25`; `src/pages/EnquirePage.test.jsx:102-113` |
| Use the general enquiry form | `/enquire?service=election-support` | `src/pages/EnquirePage.jsx:22-25`; `src/pages/EnquirePage.test.jsx:115-127` |
| Send campaign-support enquiry | Existing inline `insertEnquiry` submission | `src/pages/ServiceSupport.jsx:23-74`; `src/pages/ServiceSupport.test.jsx:35-49` |

## 6. Claim and source table

| Proposed substantive claim | Evidence | Decision |
|---|---|---|
| The lead offer is data-led campaign management and consultancy for Conservative associations, candidates, councillors and council groups. | [Paul Startin's LinkedIn profile](https://www.linkedin.com/in/paulstartin/), headline, About and Political Solutions experience, reviewed 19 August 2026. | Use as owner-controlled offer positioning. Do not treat the profile as independent proof of outcomes. |
| The consultancy offer includes campaign management, strategy, candidate coaching and association support. | [Paul Startin's LinkedIn profile](https://www.linkedin.com/in/paulstartin/), About and Political Solutions experience, reviewed 19 August 2026. | Retain as the published service offer. |
| Political Solutions offers retained campaign planning, data and standing strategic support across the electoral cycle. | [Paul Startin's LinkedIn profile](https://www.linkedin.com/in/paulstartin/), About and Political Solutions experience, reviewed 19 August 2026. | Retain without claiming a fixed package, duration or result. |
| Political Solutions runs a mentorship programme for association officers. | [Paul Startin's LinkedIn profile](https://www.linkedin.com/in/paulstartin/), About and Political Solutions experience, reviewed 19 August 2026. | Express as officer mentoring that can form part of an agreed scope; do not describe programme terms that are not supplied. |
| Political Solutions presents three distinct public service lines. | `src/pages/Home.jsx:9-41`; `src/pages/Services.jsx:42-46`; `src/pages/EnquirePage.jsx:12-25` | Keep the three approved names and their jobs separate, but do not give them equal narrative weight. |
| Marked-register files are submitted through the portal; processing status and any released result are shown with the batch. | `POLITICAL_SOLUTIONS_CONTEXT.md:9-12`; `src/pages/portal/Uploads.jsx:304-355,386-404,617-695`; `src/pages/portal/Uploads.test.jsx:516-658` | Retain without promising that every batch produces an output, a turnaround time or a specific output format on these pages. |
| The portal currently accepts PDF, CSV and XLSX marked-register inputs. | `src/pages/portal/Uploads.jsx:7-13,83-88,417-420,530-534` | Do not name formats in this draft because the previously approved public copy names PDF and CSV only. Record for confirmation. |
| Constituency Intelligence includes election results, demographics, swing analysis, vulnerability scores and Reform UK, Liberal Democrat and Green Party threat indices. | `POLITICAL_SOLUTIONS_CONTEXT.md:11-12,205-220`; `src/pages/portal/constituency/ConstituencyDetail.jsx:1868-1883,2276-2310` | Retain. Do not add freshness, completeness or real-time claims. |
| Constituency Intelligence access is permission-based and scoped to an organisation's constituencies. | `POLITICAL_SOLUTIONS_CONTEXT.md:190-203,255-279`; `src/pages/portal/constituency/ConstituencyDetail.jsx:1868-1869,2235-2236` | Retain. Do not turn the 650-seat dataset into an unrestricted customer-access claim. |
| Campaign support may include volunteer briefings, data coordination, print logistics and delivery oversight. | `src/pages/ServiceSupport.jsx:102-112`; `docs/public-site-copy/01-homepage-and-shell.md:118-136` | Retain as possible scope, never as a fixed or guaranteed package. |
| Campaign support is separate from subscriptions and is scoped and priced before work begins. | `src/pages/ServiceSupport.jsx:76-81,102-121`; `src/pages/Services.jsx:10-16` | Retain. |
| Clients remain responsible for electoral-law and regulated-spending compliance, and Political Solutions does not provide statutory electoral services. | `src/pages/ServiceSupport.jsx:114-121`; `src/pages/Services.jsx:129-137` | Retain the existing boundary wording without extending it into legal advice. |
| Public association-subscription pricing is based on constituency count. | `src/lib/subscriptionPricing.js`; `src/pages/Subscribe.jsx`; `POLITICAL_SOLUTIONS_CONTEXT.md:353-358` | Verified, but do not duplicate static amounts on product pages. Send visitors to `/subscribe` for the current exact price. |
| The public subscription route supports association selection, Stripe Checkout and invoice requests. | `src/pages/Subscribe.jsx`; `src/lib/subscriptionApi.js`; `src/pages/Subscribe.test.jsx` | Retain only as the CTA destination. Do not imply a specific product-entitlement bundle. |
| The enquiry page recognises the product presets used in this draft. | `src/pages/EnquirePage.jsx:12-27`; `src/pages/EnquirePage.test.jsx:68-141` | Retain the verified query-string destinations. |

## 7. Price review

No price appears in the proposed product-page copy.

The active public `/subscribe` page uses association pricing of £500 per year excluding VAT for
the first constituency plus £250 per year excluding VAT for each additional constituency. The
exact selected-association price is also supplied by the `associations_with_pricing` view.

Separately, the protected `/portal/subscriptions` implementation still contains monthly capability
tiers and a £65 one-off Marked Register Processing item. Task 06 does not authorise changing or
reconciling either commercial flow. Publishing a static amount on the three product pages would
therefore imply a pricing decision that the repository does not establish.

Sources:

- `src/lib/subscriptionPricing.js`
- `src/pages/Subscribe.jsx`
- `src/lib/subscriptionApi.js`
- `src/data/subscriptions.js`
- `src/data/products.js`
- `src/pages/Subscriptions.jsx:115-140,185-315`
- `src/App.jsx:501-520`

## 8. Removed or rejected wording

| Wording or approach | Decision and reason |
|---|---|
| Treating three products as three equal campaign jobs | Replace. The LinkedIn offer clearly leads with campaign management and consultancy, with data capabilities underpinning the work. |
| Presenting Marked Register Processing as the centre of the Political Solutions offer | Replace. Keep it visible and distinct, but subordinate it to the consultancy-led proposition. |
| Current, up-to-date or real-time constituency data | Exclude. No single verified update cadence applies to every dataset. |
| Current data on every Conservative-held and target seat | Exclude. The dataset and permission model do not establish unrestricted access for every customer. |
| Every local authority in England and Wales | Exclude from these pages. It is outside the core product evidence selected for this copy and would require separate coverage validation. |
| Accurate historical baselines | Replace with “recorded election results”. Accuracy should not be asserted without a defined assurance standard. |
| Reliable seat-level data | Replace with specific evidence categories. “Reliable” is an unqualified quality claim. |
| Validation and audit-ready processing | Exclude. “Audit-ready” is not established for every processed output. |
| Work through one secure portal | Exclude. Campaign support is separately scoped work and must not be presented as portal functionality. |
| Subscription platform access included | Exclude. The inspected sources do not define one public entitlement bundle covering every service. |
| All 650 UK constituencies as a customer-access claim | Exclude. The repository describes a 650-seat dataset, while user access remains permission-based. |
| We will be in touch within one working day | Exclude pending confirmation that this remains an approved operational commitment. |
| UK-wide product coverage | Exclude from this draft. Existing pages and structured data use the phrase, but the exact scope has not been independently defined for each service. |
| Fixed support packages or prices | Exclude. Campaign support is scoped and priced before work begins. |
| The LinkedIn claims of more than 40 processed registers and a 24-hour turnaround | Exclude from product copy pending confirmation that the volume is documented and the turnaround remains an approved operational commitment. |
| The LinkedIn election-result figures and campaign case studies | Exclude from product copy pending approval of the exact figures, evidence and presentation. |
| Testimonials, success rates or guaranteed electoral outcomes | Exclude. No approved evidence or assurance basis was supplied. |

## 9. Unresolved questions

These questions do not block review of the draft because the disputed claims and prices have been
excluded.

1. May the public Marked Register Processing copy name XLSX as an accepted input? The current portal accepts it, but the previously approved homepage copy names PDF and CSV only.
2. Which pricing model should future public Marked Register copy describe: the public association-based annual subscription, the protected portal's £65 one-off item, or both as separate commercial routes?
3. Which specific products and portal capabilities are included in the public association subscription? The inspected sources do not provide one current entitlement matrix.
4. May Constituency Intelligence advertise all 650 constituencies as dataset coverage while stating that customer access is permission-based, or should public copy refer only to permitted constituencies?
5. Is “within one working day” still an approved response-time commitment for enquiries? It remains in current success messages but was not independently confirmed.
6. Is UK-wide coverage approved for all three services, or only as a general support statement in the public footer?
7. Should the Keighley & Ilkley and Eccleshall & Gnosall results published on LinkedIn become public-site case studies? If yes, the exact figures, source evidence and approved wording need to be confirmed before implementation.
8. May public product copy use “over 40 registers processed” and “24-hour turnaround” as current Marked Register Processing claims? Both appear on LinkedIn, but the repository does not document the volume and the turnaround would create an operational commitment.
9. Should the association-officer mentorship programme be presented as a named standalone offer, or remain a possible part of a scoped support engagement as drafted here?

## 10. Approval gate

**Status:** `DRAFT — USER APPROVAL REQUIRED`

Approve or amend this copy before Task 07 changes product-page code, CSS, forms, structured data
or metadata.
