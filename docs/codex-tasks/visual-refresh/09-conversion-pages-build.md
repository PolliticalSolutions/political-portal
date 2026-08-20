# Task 09: Build the enquiry and commerce pages

Follow `00-shared-rules.md`.

## Prerequisite

`docs/public-site-copy/03-conversion-pages.md` must have explicit user approval. Otherwise stop and ask.

## Objective

Apply the approved public design and copy to enquiry, subscription, cart, checkout, and confirmation pages without changing transactional behaviour.

## Requirements

- Preserve every API call, pricing calculation, VAT rule, cart transition, payment state, redirect, query parameter, form payload, validation rule, and analytics event.
- Preserve the existing `/subscriptions` redirect exactly; do not turn it into a new page.
- Limit changes to presentation, approved copy, semantic markup, accessibility, and public-scoped styles.
- Make failures explicit in the UI. Do not replace actionable errors with generic messages.
- Maintain complete loading, empty, disabled, retry, success, and failure states.
- Do not modify auth routes even if entry wrappers inspect authentication state.

## Verification

- Pass 1: all existing enquiry, subscription, cart, checkout, pricing, and confirmation tests plus `npm run build`.
- Pass 2: independent browser walkthrough at desktop/mobile covering normal flow and every safely reproducible error/empty state; compare displayed totals and submitted payloads with the unchanged underlying logic.
