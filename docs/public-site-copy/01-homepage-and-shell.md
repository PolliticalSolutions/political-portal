# Homepage and shared-shell copy specification

**Status:** `DRAFT — USER APPROVAL REQUIRED`

This document specifies copy only. It does not authorise changes to application code, CSS, assets, routes or metadata.

## 1. Page objective and audience

### Objective

Present Political Solutions as a professional political intelligence platform with three distinct offers, help visitors identify the offer that matches their immediate job, and move qualified visitors towards a briefing request.

### Audience

Primary audience: Conservative associations, campaign managers, agents and MPs' offices.

Secondary audience: candidates, association officers, researchers and headquarters teams involved in campaign planning, marked-register work or operational delivery.

### Action hierarchy

- **Primary homepage action:** **Request a briefing** → `/enquire?service=platform-briefing`
- **Secondary homepage action:** **View products** → `/services`

The primary action should be repeated in the public navigation, hero and closing section. The secondary action should remain visually subordinate. Product-specific links are local navigation, not competing page-level actions.

## 2. Exact proposed copy

### Public navigation

| Element | Exact copy | Destination | Treatment |
|---|---|---|---|
| Home link accessible name | Political Solutions | `/` | Use the approved outlined logo artwork. Do not repeat the wordmark or strapline as live text. |
| Navigation link | Products | `/services` | Standard navigation link. |
| Navigation link | Blog | `/blog` | Standard navigation link. |
| Navigation link | Contact | `/enquire` | Standard navigation link. |
| Account utility | Client login | `/login` | Utility link, visually subordinate to the primary action. |
| Primary action | Request a briefing | `/enquire?service=platform-briefing` | The only primary navigation button. |
| Mobile menu control | Menu | No route | Retain the current control label. |

Authenticated-only navigation remains outside this copy task and should not be changed from this specification.

### Homepage hero

**Heading**

> Political data for campaign decisions

**Lead**

> Process marked registers, review constituency intelligence and request practical campaign support through three distinct Political Solutions products.

**Primary CTA**

> Request a briefing

Destination: `/enquire?service=platform-briefing`

**Secondary CTA**

> View products

Destination: `/services`

**Audience line**

> For Conservative associations, campaign managers, agents and MPs' offices.

### Product choice

**Section heading**

> Choose the product that matches the job

**Introductory copy**

> Each product has a defined purpose and a clear next step.

#### Product 1

**Name**

> Marked Register Processing

**Description**

> Upload marked-register PDF or CSV files through the portal. Political Solutions processes them and supplies the result as a CSV download.

**Audience**

> For agents, association officers and teams handling marked-register returns.

**CTA**

> View subscription pricing

Destination: `/subscribe`

#### Product 2

**Name**

> Constituency Intelligence

**Description**

> Review election results, demographics, swing analysis, vulnerability scores and party-specific threat indices in one constituency intelligence workspace.

**Audience**

> For campaign managers, researchers, association officers and headquarters teams comparing seats.

**CTA**

> Explore Constituency Intelligence

Destination: `/constituency-intelligence`

#### Product 3

**Name**

> Campaigning, Training & Election Support

**Description**

> Request separately scoped support for campaign planning, volunteer briefings, data coordination, print logistics and delivery oversight.

**Audience**

> For candidates, agents and association teams that need hands-on operational support.

**CTA**

> Discuss campaign support

Destination: `/enquire?service=election-support`

### Product-proof section

This section should feature real Constituency Intelligence product imagery when the later imagery and build tasks are approved. The following is the exact accompanying copy.

**Heading**

> Constituency evidence in one workspace

**Body**

> Move from election history and demographic context to swing, vulnerability and threat analysis at constituency level.

**Image caption**

> Constituency Intelligence in the Political Solutions portal.

No additional CTA is proposed in this section. The product link already appears in the product-choice section.

### Experience and proof

**Heading**

> Built for controlled campaign work

**Body**

> Political Solutions is designed for Conservative associations, campaign managers and MPs' offices.

**Proof points**

| Label | Supporting copy |
|---|---|
| Portal workflow | Marked-register files are uploaded and Constituency Intelligence is accessed through the platform. |
| Permission-based access | Portal access is tied to user and constituency permissions. |
| Separately scoped support | Campaign support is agreed and charged separately from platform subscriptions. |

Do not add client logos, testimonials, delivery volumes, success rates, years of experience or founder credentials until approved evidence exists.

### Process

**Section heading**

> Start with the job in front of you

#### Step 1

**Heading**

> Identify the work

**Body**

> Decide whether you need a processed marked register, constituency evidence or hands-on campaign support.

#### Step 2

**Heading**

> Choose the route

**Body**

> Subscribe online for Marked Register Processing. Request a briefing for Constituency Intelligence. Submit a brief for campaign support.

#### Step 3

**Heading**

> Confirm the detail

**Body**

> Confirm the organisation, relevant constituencies, access requirements and any work that needs a separate scope.

### Closing CTA

**Heading**

> Not sure which product fits the job?

**Body**

> Tell us what you need. We will route your enquiry to the right product and confirm the next step.

**Primary CTA**

> Request a briefing

Destination: `/enquire?service=platform-briefing`

**Secondary CTA**

> View products

Destination: `/services`

### Public footer

#### Brand block

**Name**

> Political Solutions

**Description**

> Political data products and operational support for Conservative campaign teams.

#### Products

| Link label | Destination |
|---|---|
| Marked Register Processing | `/subscribe` |
| Constituency Intelligence | `/constituency-intelligence` |
| Campaigning, Training & Election Support | `/services/election-support` |

#### Company and account

| Link label | Destination |
|---|---|
| Blog | `/blog` |
| Contact | `/enquire` |
| Client login | `/login` |

#### Contact

> paul@politicalsolutions.uk

Email destination: `mailto:paul@politicalsolutions.uk`

> UK-wide support

#### Legal links

| Link label | Destination |
|---|---|
| Privacy policy | `/privacy` |
| Terms of use | `/terms` |
| Cookie notice | `/cookies` |

#### Legal disclosure

> Startin Sales Solutions Ltd, trading as Political Solutions.

### Homepage metadata

**Title value in `seoRoutes.js`**

> Political data products for UK campaign teams

**Rendered title**

> Political data products for UK campaign teams | Political Solutions

**Meta description, 150 characters**

> Process marked registers, review constituency intelligence and request practical campaign support with Political Solutions for UK campaign operations.

## 3. Claim and source table

| Proposed substantive claim | Repository evidence | Decision |
|---|---|---|
| Political Solutions has three distinct offers: Marked Register Processing, Constituency Intelligence, and Campaigning, Training & Election Support. | `src/pages/Home.jsx:40-45`; `src/pages/Services.jsx:42-46` | Retain, with shorter wording and separate product descriptions. |
| The intended audience includes Conservative associations, campaign managers, agents and MPs' offices. | `POLITICAL_SOLUTIONS_CONTEXT.md:9-22`; `src/pages/Home.jsx:55-57`; `src/pages/Services.jsx:81-82,99-100,117-118` | Retain as an audience statement, not a customer claim. |
| Marked-register PDF and CSV files are uploaded through the portal and processed into a CSV download. | `POLITICAL_SOLUTIONS_CONTEXT.md:11` | Retain. XLSX is excluded pending confirmation. |
| Constituency Intelligence includes election results, demographics, swing analysis, vulnerability scores and threat indices. | `POLITICAL_SOLUTIONS_CONTEXT.md:12`; `src/pages/Services.jsx:92-100` | Retain without claims about freshness, completeness or unrestricted access. |
| Campaign support can include planning, volunteer briefings, data coordination, print logistics and delivery oversight. | `src/pages/ServiceSupport.jsx:103-112` | Retain as possible scope, not a guaranteed package. |
| Campaign support is separate from subscriptions and is scoped before work begins. | `src/pages/ServiceSupport.jsx:78-81,109-118`; `src/pages/Services.jsx:13-16` | Retain to keep the service distinct from portal products. |
| Portal access is permission-based and scoped by organisation and constituency. | `POLITICAL_SOLUTIONS_CONTEXT.md:190-203,255-279` | Retain as an operating fact. Avoid suggesting every user has unrestricted access to every constituency. |
| Association subscriptions can be selected and purchased online. | `src/pages/Subscribe.jsx:325-370`; `POLITICAL_SOLUTIONS_CONTEXT.md:353-361` | Retain only in process copy and the Marked Register CTA. Do not publish a static price on the homepage. |
| The enquiry route supports platform briefing, Constituency Intelligence and election-support presets. | `src/pages/EnquirePage.jsx:22-27` | Retain the verified query-string destinations. |
| All proposed page destinations exist. | `src/App.jsx:366-387` | Retain. Use `/subscribe` as the direct subscription route; `/subscriptions` currently redirects there. |
| Political Solutions provides UK-wide support. | `src/pages/Services.jsx:23-25,156-159`; `src/pages/ServiceSupport.jsx:103-107` | Retain only as a general footer statement. Do not extend it into unsupported product coverage claims. |
| The public name is Political Solutions and the formal legal disclosure is Startin Sales Solutions Ltd, trading as Political Solutions. | `docs/codex-tasks/visual-refresh/README.md:23-27` | Use the public name throughout and reserve the legal entity for the footer disclosure. |
| The public contact email is paul@politicalsolutions.uk. | `src/components/Footer.jsx:23-26`; `src/pages/ServiceSupport.jsx:64-69` | Retain. |
| Homepage titles are rendered with the Political Solutions suffix. | `src/seo/RouteSeo.jsx:5-14`; `POLITICAL_SOLUTIONS_CONTEXT.md:80-94` | Specify the route title value and the complete rendered title separately. |

### Editorial reference sources reviewed

- `C:\Users\pauls\OneDrive\Documents\Claude\Projects\Political Knowledge Base\Brand\README - Logo usage.md`
- `C:\Users\pauls\OneDrive\Documents\Claude\Projects\Political Knowledge Base\Brand\website-handover\POLITICAL_SOLUTIONS_DESIGN_SYSTEM.md`

These Brand-folder documents were treated as read-only reference material. The task pack controls scope and naming where instructions differ.

## 4. Removed or rejected wording

| Wording or approach | Decision and reason |
|---|---|
| Political Solutions Ltd | Remove everywhere. It is not the approved public name or legal disclosure. |
| UK Political Operations Platform as separately typed header copy | Do not repeat it beside the logo. The approved lockup already contains the strapline, and the Brand guidance says not to reset or re-space it as live text. |
| Political data products for campaign teams that need clean delivery | Replace. “Clean delivery” is vague and does not explain the visitor's decision. |
| The current long hero paragraph naming all three products in one sentence | Replace with a shorter lead and distinct product descriptions. |
| View Marked Register plans as the primary homepage CTA | Demote to a product-specific CTA. It makes one product appear to be the whole business and weakens the data-led positioning. |
| Why teams trust Political Solutions | Remove. It implies customer endorsement without cited customer evidence. |
| Secure access, clear scope, and audit-ready handover | Do not use as a bundled proof claim. Authentication and permissions are evidenced, but “audit-ready handover” is not established for every product. |
| Work through one secure portal | Remove from shared positioning. It risks presenting separately scoped campaign support as portal functionality. |
| Current, up-to-date or real-time constituency data | Exclude until update cadence and coverage are verified for each dataset. |
| All 650 UK constituencies as a customer-access claim | Exclude from proposed public copy. The project context describes a 650-seat dataset, while access is permission-based and the current public page describes Conservative-held and target seats. |
| Excel or XLSX input | Exclude pending confirmation. `Home.jsx` mentions Excel, while the project context names PDF and CSV only. |
| We will be in touch within one working day | Exclude from homepage copy pending confirmation that this remains an operational commitment. |
| Rather than generic campaign software | Remove. It is an unsupported competitor comparison and adds no useful product information. |
| World-class, best-in-class, cutting-edge, revolutionary, seamless, game-changing | Reject as unsupported startup language. None is proposed. |
| Customer counts, success rates, testimonials, delivery history or founder credentials | Exclude because no approved repository evidence was found in the inspected sources. |

## 5. Unresolved factual questions

These questions do not block review of the proposed copy because the disputed claims have been excluded.

1. Does production Marked Register Processing accept Excel or XLSX files, and may that format be advertised publicly?
2. Does customer-visible Constituency Intelligence cover all 650 UK constituencies, or only the constituencies granted through association permissions?
3. Is “within one working day” still an approved response-time commitment for public enquiries?
4. Are there approved customer logos, testimonials, delivery figures, years-of-experience claims or founder credentials that should be considered for a later proof section?
5. Should the public footer include a company registration number or registered-office address in addition to “Startin Sales Solutions Ltd, trading as Political Solutions”? No verified values were found in the inspected sources.

## 6. Approval gate

**Status:** `DRAFT — USER APPROVAL REQUIRED`

Approve or amend this copy before any homepage, navigation, footer or metadata implementation begins.
