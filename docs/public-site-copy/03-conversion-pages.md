# Conversion-page copy specification

**Status:** `APPROVED BY USER — 2026-08-19`

This document specifies copy only for `/enquire` and `/subscribe`, and records the approved redirect
behaviour for `/cart`, `/checkout`, and `/checkout/confirmation`. It does not authorise further
changes to code, styling, routes, prices, products, payment behaviour, account provisioning,
permissions, structured data or metadata.

The payment facts in this draft reflect the separately approved correction made before this copy
task resumed: public card payment now uses Stripe Checkout for a VAT-inclusive annual subscription,
and the former public one-time card route has been retired. Invoice payment remains a separate path.

## 1. Route roles and action hierarchy

| Route | Page job | Primary action | Secondary action |
|---|---|---|---|
| `/enquire` | Collect a usable brief for campaign support, data services or another Political Solutions enquiry. | **Send enquiry** | Direct email is shown only when submission fails. |
| `/subscribe` | Let an association review the exact annual price and continue through annual Stripe Checkout. | **Start annual Stripe subscription** | **Request invoice** |
| `/cart` | Retired public route. | Redirect to `/subscribe`. | None. |
| `/checkout` | Retired public route. | Redirect to `/subscribe`. | None. |
| `/checkout/confirmation` | Retired public route. | Redirect to `/subscribe`. | None. |

The copy must not describe a subscription as including every Political Solutions product. The
repository does not contain one approved public entitlement matrix.

## 2. `/enquire`

### Page objective

Collect the organisation, service interest and context Political Solutions needs to understand the
enquiry. Keep data-led campaign management and consultancy prominent without turning every enquiry
into a subscription enquiry.

### Hero

**Eyebrow**

> Contact Political Solutions

**Heading**

> Discuss your campaign, data or support needs

**Lead**

> Tell us about the organisation, campaign job or data requirement you want to discuss. Choose any relevant services and include the context Political Solutions should review.

This wording deliberately makes no response-time promise.

### What happens next

**Section heading**

> Send a useful brief

**Body**

> Your enquiry is recorded with the contact details, organisation, service interests and message you provide. Political Solutions can then use that information to follow up on the appropriate next step.

The first sentence is established by the enquiry insert payload. “Can then use” avoids promising a
specific response time, channel, price or outcome.

### Form fields

#### Name

**Label**

> Name *

**Required validation**

> Enter your name.

#### Email

**Label**

> Email *

**Helper text**

> Use the address Political Solutions should reply to.

**Required validation**

> Enter your email address.

**Format validation**

> Enter a valid email address.

The current validation checks only that the value contains `@`. Task 09 must not imply stronger
email verification unless validation behaviour is separately changed and tested.

#### Organisation

**Label**

> Organisation *

**Placeholder option**

> Select an organisation

**Required validation**

> Select an organisation.

The current field is limited to the bundled association list. This draft does not add an “other”
organisation path because the current form schema has none.

#### Service interests

**Legend**

> What would you like to discuss?

**Helper text**

> Select all that apply. You can also explain the requirement in your message.

**Options, in this order**

1. `Campaigning, Training & Election Support`
2. `Constituency Intelligence`
3. `Marked Register Processing`
4. `General campaigning consultancy`
5. `Automated content generation for literature`
6. `Clerical services for your association or federation`
7. `Something else`

No service selection is required by the current validation.

#### Role

**Label**

> Your role

**Helper text**

> Optional. For example, agent, candidate, officer or campaign manager.

The examples are role descriptions, not audience-eligibility claims.

#### Message

**Label**

> What would you like to discuss? *

**Helper text**

> Include the relevant campaign, constituencies, timing and the decision or work you need support with.

**Required validation**

> Enter a message.

“Timing” asks the enquirer for context; it does not promise availability or delivery against that
timing.

### Preset states

| Incoming URL | Preset state | Evidence |
|---|---|---|
| `/enquire?service=election-support` | Preselect `Campaigning, Training & Election Support`. | `SERVICE_PARAM_MAP` and page test |
| `/enquire?service=constituency-intelligence` | Preselect `Constituency Intelligence`. | `SERVICE_PARAM_MAP` and page test |
| `/enquire?service=marked-register` | Preselect `Marked Register Processing`. | `SERVICE_PARAM_MAP` and page test |
| `/enquire?service=platform-briefing` | Prefill the message with `I'd like to request a platform briefing.` | `SERVICE_PARAM_MAP` and page test |

The user may edit or clear every preset value before submission.

### Submission states

**Default submit action**

> Send enquiry

**In-progress action**

> Sending enquiry…

The in-progress label is proposed copy for the existing asynchronous insert. It does not authorise
changing the submission destination or payload.

**Success message**

> Thank you. Your enquiry has been submitted.

Do not retain “within one working day” unless the user separately confirms it as a current
operational commitment.

**Submission error**

> We couldn't send your enquiry. Please try again or email paul@politicalsolutions.uk directly.

Email destination: `mailto:paul@politicalsolutions.uk`

**Retry action**

> Try again

The existing form retains entered values after an insert error, so retry copy must not tell the user
to re-enter the form.

### SEO copy

**Title value in `seoRoutes.js`**

> Campaign support and data enquiries

**Rendered title**

> Campaign support and data enquiries | Political Solutions

**Meta description**

> Discuss campaign management, constituency intelligence, marked-register processing or practical campaign support with Political Solutions.

## 3. `/subscribe`

### Page objective

Let an association select its record, review a VAT-inclusive annual total, provide contact details
and choose annual Stripe Checkout or a separate invoice request.

### Hero

**Eyebrow**

> Association subscription

**Heading**

> Start an annual Political Solutions subscription

**Lead**

> Select your association and review the annual price before continuing to Stripe Checkout or requesting an invoice.

**Existing-customer link label**

> Already have an account? Log in

Destination: `/login`

This avoids claiming that every previous payer already has working portal credentials.

### Pricing guide

**Section heading**

> Annual subscription pricing

**Introductory copy**

> The annual price is £500 excluding VAT for the first constituency, plus £250 excluding VAT for each additional constituency. Select an association to see the calculated VAT and annual total.

**Exact guide values**

| Constituencies | Annual price excluding VAT | VAT at 20% | Annual total including VAT |
|---:|---:|---:|---:|
| 1 | £500.00 | £100.00 | £600.00 |
| 2 | £750.00 | £150.00 | £900.00 |
| 5 | £1,500.00 | £300.00 | £1,800.00 |
| 10 | £2,750.00 | £550.00 | £3,300.00 |

**Additional-constituency line**

> Each additional constituency: £250.00 excluding VAT; £300.00 including VAT.

Do not round these amounts, replace “annual” with “monthly”, or describe VAT as handled
separately from Stripe Checkout.

### Step 1: association and price

**Section heading**

> 1. Select your association

**Search label**

> Search associations

**Search placeholder**

> Search by association, region or constituency

**Association label**

> Association

**Association placeholder**

> Select an association

**Loading state**

> Loading associations and pricing…

**Load error**

> We couldn't load association pricing. Refresh the page and try again.

**No search results**

> No associations match that search.

**Clear-search action**

> Clear search

### Selected-price summary

Use one authoritative summary for the selected billable count.

**Row labels**

- `Annual price excluding VAT`
- `VAT (20%)`
- `Annual total including VAT`

**Count-control label**

> Constituencies used to calculate this price

**Count-control helper text**

> The value is limited to the constituency count currently recorded for the selected association.

**Constituency-list label**

> Constituencies currently recorded for this association

Do not use “Your subscription covers” here until the entitlement rule in the unresolved-questions
section is answered. The current code can calculate a price from one count while portal permission
lookups expand association-level access through `association_constituencies`.

### Step 2: contact details

**Section heading**

> 2. Your details

**Name label**

> Name *

**Email label**

> Email address *

**Organisation or role label**

> Organisation or role

**Phone label**

> Phone

**Stripe validation**

> Enter your name and email address before continuing to Stripe Checkout.

**Invoice validation**

> Enter your name and email address before requesting an invoice.

Only name and email are required by the current payment and invoice actions.

### Step 3: annual Stripe Checkout

**Section heading**

> 3. Choose how to pay

**Primary action**

> Start annual Stripe subscription

**Supporting copy, with calculated amount**

> Stripe Checkout will charge **£{annual total including VAT}** today. The subscription will renew once a year.

The first sentence is established by the current VAT-inclusive Checkout amount. The second sentence
states only the confirmed recurrence interval; it does not make an unsupported renewal-price or
notice promise.

**Redirecting state**

> Opening Stripe Checkout…

**Checkout-start error**

> We couldn't open Stripe Checkout. Check your details and try again.

**Cancelled-return state for `/subscribe?cancelled=true`**

> You returned before completing Stripe Checkout. Review the subscription details and continue when you're ready.

This state must not say that payment failed, because the cancellation URL establishes only that the
visitor returned from Checkout.

### Step 3: invoice path

**Secondary action**

> Request invoice

**Supporting copy, with calculated amount**

> Request a Stripe invoice for **£{annual total including VAT}**. The invoice is due 14 days after issue. This is a one-off invoice and does not renew automatically.

The 14-day term is established by `days_until_due: 14`. The final sentence is necessary because the
invoice endpoint creates a one-off invoice, not a recurring Stripe subscription.

**Requesting state**

> Creating invoice…

**Success message when an invoice URL is returned**

> Your invoice has been created for **{email address}**. Use the link below to view and pay it.

**Invoice link label**

> View invoice

**Success message when no invoice URL is returned**

> Your invoice request has been recorded for **{email address}**.

This fallback avoids claiming that an email was delivered when the response contains no invoice
URL and the client has no delivery receipt.

**Invoice error**

> We couldn't create the invoice. Check your details and try again.

Do not promise account activation after invoice payment. No verified `invoice.paid` provisioning
path was found in the inspected implementation.

### No-association state

**Heading**

> Select an association first

**Body**

> Choose the association before continuing to Stripe Checkout or requesting an invoice.

Both payment-submission actions should remain unavailable until an association is selected.

### Stripe success and account access

The current Checkout success destination is `/portal?subscription=success`. `/portal` is protected,
and the subscription-created handler records portal subscription and permission rows only when the
Checkout metadata contains a Cognito user identifier. A public visitor can currently start Checkout
with only a name and email, so the repository does not establish one truthful success or automatic
activation message for every buyer.

Until the identity-linking rule is approved and implemented, do not publish any of the following:

- “Your account is active.”
- “Your access has been enabled.”
- “Your account will be set up automatically.”
- “You now have access to every constituency shown.”
- a fixed activation time.

The appropriate success screen and login/account-recovery copy remain an unresolved product-flow
question, not an editorial inference.

### SEO copy

**Title value in `seoRoutes.js`**

> Annual association subscriptions

**Rendered title**

> Annual association subscriptions | Political Solutions

**Meta description**

> Review annual Political Solutions association pricing, including VAT, and continue through Stripe Checkout or request an invoice.

## 4. Retired commerce routes

### `/cart`

Current and approved behaviour: redirect to `/subscribe`.

There is no public empty-cart, populated-cart or cart-error copy to approve because this route no
longer renders a cart.

### `/checkout`

Current and approved behaviour: redirect to `/subscribe`.

There is no separate public card form, checkout review or retry state. Annual card payment begins
from `/subscribe` and continues on hosted Stripe Checkout.

### `/checkout/confirmation`

Current and approved behaviour: redirect to `/subscribe`.

This route must not render the previous one-time-payment confirmation or any activation promise.
Stripe Checkout currently returns successful subscription payments to
`/portal?subscription=success`, which requires the account-linking decision documented above.

### SEO treatment

These three retired routes should not receive independent titles, descriptions or canonical content.
Their only public behaviour is the redirect to `/subscribe`.

## 5. End-to-end state review

| Journey state | Approved draft treatment | Unsupported wording excluded |
|---|---|---|
| First visit to `/enquire` | Explain what information to provide; show required fields clearly. | Response-time guarantees. |
| Enquiry validation failure | Identify the exact missing or invalid field inline. | Generic “form invalid” without field guidance. |
| Enquiry insert in progress | `Sending enquiry…` | “Received” before the insert succeeds. |
| Enquiry success | `Thank you. Your enquiry has been submitted.` | “Within one working day.” |
| Enquiry insert failure and retry | Preserve entered values; offer retry and direct email. | Telling the user to start again. |
| First visit to `/subscribe` | Show annual price basis; require association selection before payment. | Monthly pricing or automatic activation. |
| Association/pricing load failure | Explain that pricing could not be loaded and offer refresh. | A fabricated fallback total. |
| Association search with no match | State that no result matches; offer clear search. | “Association not eligible.” |
| Annual Stripe path | Show the exact VAT-inclusive total charged today and annual recurrence. | VAT invoiced separately; one-time payment; fixed renewal price. |
| Stripe Checkout cannot open | Keep the user on `/subscribe`; show retry guidance. | “Payment failed” before Checkout opens. |
| Checkout cancelled return | Say the visitor returned before completion. | “Payment declined” or “refund issued.” |
| Invoice path | Show exact VAT-inclusive amount and 14-day invoice term; state it is not automatic renewal. | Automatic activation or recurring invoice claims. |
| Invoice request failure | Keep entered details; offer retry. | Claiming an invoice was sent. |
| Empty `/cart` | Redirect to `/subscribe`; no empty-cart page. | Legacy cart instructions. |
| Direct `/checkout` visit | Redirect to `/subscribe`; no embedded card form. | One-time card wording. |
| Direct `/checkout/confirmation` visit | Redirect to `/subscribe`; no local confirmation. | Payment or access confirmation. |

## 6. Claim and source table

| Proposed substantive claim or state | Evidence | Decision |
|---|---|---|
| Enquiries record name, email, organisation, selected services, role and message. | `src/pages/EnquirePage.jsx:79-93`; `src/lib/enquiriesApi.js` | Retain. Organisation and message are required by the page even though the database helper can store null values. |
| Enquiry presets exist for election support, Constituency Intelligence, Marked Register Processing and platform briefing. | `src/pages/EnquirePage.jsx:22-31`; `src/pages/EnquirePage.test.jsx:90-141` | Retain exact routes and values. |
| Name, email, organisation and message are required on `/enquire`; service interest and role are optional. | `src/pages/EnquirePage.jsx:66-75`; `src/pages/EnquirePage.test.jsx:32-45,143-160` | Retain. |
| Successful enquiry insert can be acknowledged without a response-time claim. | `src/pages/EnquirePage.jsx:79-95`; `src/pages/EnquirePage.test.jsx:162-196` | Use “has been submitted”; exclude “within one working day” pending confirmation. |
| Enquiry insert failure can offer direct email to `paul@politicalsolutions.uk`. | `src/pages/EnquirePage.jsx:219-225`; `src/pages/EnquirePage.test.jsx:198-218` | Retain. |
| Annual price is £500 ex VAT for the first constituency and £250 ex VAT for each additional constituency. | `src/lib/subscriptionPricing.js:1-7`; `infra/enquiry-api/stripe-src/checkout-pricing.js:3-9` | Retain exact values. |
| VAT is calculated at 20%. | `src/lib/subscriptionPricing.js:1,9-24`; `infra/enquiry-api/stripe-src/checkout-pricing.js:3,8` | Retain exact rate and calculated totals. |
| Hosted Stripe Checkout charges the VAT-inclusive total and creates a yearly recurring subscription. | `infra/enquiry-api/stripe-src/checkout-pricing.js:24-45`; `infra/enquiry-api/test/stripe-checkout-pricing.test.mjs` | Retain. This is the only active public card-payment route. |
| The former one-time PaymentIntent API event is retired. | `infra/enquiry-api/template.yaml:490-506`; `src/lib/subscriptionApi.js:96-99`; public redirects in `src/App.jsx:492-494` | Do not offer embedded or one-time card payment. |
| Invoice request creates a VAT-inclusive Stripe invoice due in 14 days. | `infra/enquiry-api/stripe-src/index.js:180-208` | Retain as a separate invoice path. Do not describe it as recurring. |
| `/cart`, `/checkout` and `/checkout/confirmation` redirect to `/subscribe`. | `src/App.jsx:492-495`; `src/App.test.jsx` route cases | Retain; no standalone copy states. |
| Checkout success points to `/portal?subscription=success`. | `infra/enquiry-api/stripe-src/checkout-pricing.js:26-28` | Record the destination. Do not infer what an unauthenticated buyer sees next. |
| Portal subscription and permission rows require a Cognito identifier in subscription metadata. | `infra/enquiry-api/stripe-src/index.js:230-241` | Treat account linking and activation as unresolved for public checkout. |

## 7. Price and tax verification

The following calculations were independently checked in both the client and Stripe Checkout
pricing helpers:

| Count | Calculation excluding VAT | VAT calculation | Stripe total |
|---:|---:|---:|---:|
| 1 | £500.00 | £500.00 × 20% = £100.00 | £600.00 |
| 2 | £500.00 + £250.00 = £750.00 | £750.00 × 20% = £150.00 | £900.00 |
| 5 | £500.00 + (4 × £250.00) = £1,500.00 | £1,500.00 × 20% = £300.00 | £1,800.00 |
| 10 | £500.00 + (9 × £250.00) = £2,750.00 | £2,750.00 × 20% = £550.00 | £3,300.00 |

Stripe Checkout uses `unit_amount: pricing.incVatPence`, `tax_behavior: "inclusive"`, and
`recurring: { interval: "year" }`.

No monthly public association price is approved in this document.

## 8. Removed or rejected wording

| Wording or approach | Decision and reason |
|---|---|
| “We'll be in touch within one working day.” | Exclude pending confirmation that this is a current operational commitment. |
| “Confirm the next step quickly.” | Exclude. “Quickly” is an undefined response-time claim. |
| “If urgent, say so clearly.” | Exclude unless an urgent-response process is confirmed. |
| “VAT handled separately.” | Exclude for Stripe Checkout. Checkout charges the VAT-inclusive total. |
| Monthly subscription | Exclude. The approved public card subscription renews yearly. |
| One-time card payment | Exclude. The former PaymentIntent route is retired. |
| “Your account will be activated on payment.” | Exclude. Invoice-paid provisioning is not established. |
| “Automatic account setup.” | Exclude. Public checkout can start without the Cognito identifier required by the subscription-created handler. |
| “Your subscription covers” followed by every association constituency | Exclude until the relationship between the billable count and permission expansion is approved. |
| “Payment successful” on `/checkout/confirmation` | Exclude. That route now redirects and receives no verified payment result. |
| “Invoice sent” when only an invoice URL response is known | Replace with “invoice created” and show the returned link. |
| Fixed renewal price | Exclude. Annual recurrence is established; a permanent price lock is not. |
| Refund, cancellation window or prorating claims | Exclude. No approved public policy was found in the inspected sources. |
| Every subscription includes campaign support, Constituency Intelligence and Marked Register Processing | Exclude. No single entitlement matrix establishes this bundle. |

## 9. Unresolved questions

These questions do not justify inventing interim copy. Task 09 should not implement the affected
claims or states until the relevant answer is approved.

1. What exact products, portal areas and constituencies does the annual association subscription include?
2. Does “Constituencies used to calculate this price” represent a selectable licence count, or must it always equal the selected association's full recorded constituency count?
3. The current Stripe Checkout amount follows the editable count, while permission lookups expand an association permission through all linked constituencies. Which rule is commercially correct?
4. The invoice path currently uses the selected association's full calculated total even if the editable count is reduced. Should invoice and Stripe Checkout always use the same count and total?
5. Should invoice payment also begin an automatically renewing annual subscription, or remain a separately managed annual invoice as currently implemented?
6. How should a public buyer without an existing Cognito login be linked to the Stripe subscription and granted any approved access?
7. What exact success page and sign-in or account-recovery instructions should appear after successful Stripe Checkout for logged-in and logged-out buyers?
8. Should an `invoice.paid` event create or update the local subscription and any approved permissions? No verified handler was found.
9. Is “within one working day” an approved enquiry response-time commitment?
10. Is there an approved cancellation, refund, renewal-notice or prorating policy that must appear before annual payment?
11. Should the public page state whether the renewal amount may change, and if so what notice rule applies?
12. Should the organisation selector on `/enquire` support organisations not present in the bundled association list?

## 10. Verification record

### Pass 1: source and test audit

Verified:

- enquiry fields, required validation, preset query parameters, insert payload, success and error states;
- client and backend price calculations;
- 20% VAT and VAT-inclusive Stripe unit amount;
- yearly Stripe recurrence;
- 14-day one-off invoice term;
- removal of the public PaymentIntent API event;
- redirects for `/cart`, `/checkout` and `/checkout/confirmation`;
- absence of a verified universal account-activation path.

### Pass 2: independent journey and editorial review

Verified:

- first-visit and required-field failure states on `/enquire` in the running site;
- first-visit, selected-association, exact £750.00 + £150.00 = £900.00 state and missing-details validation on `/subscribe`;
- desktop and 390-pixel subscription layouts without horizontal overflow;
- all three retired public commerce routes redirect to `/subscribe`;
- retry, success and failure language against page tests and implementation;
- every operational, tax, renewal, entitlement and activation claim in this draft against a cited source or an explicit unresolved question.

## 11. Approval gate

**Status:** `APPROVED BY USER — 2026-08-19`

Approve or amend this copy before Task 09 changes conversion-page code, styles, validation states,
metadata or supporting behaviour. Approval of the wording alone does not resolve the commercial and
account-linking questions in Section 9.
