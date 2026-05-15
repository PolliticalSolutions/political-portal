# Campaign Module — Manual Test Checklist

Run through this checklist after deploying the migration, seed scripts,
Lambdas, and frontend. Each section is independent. Tick boxes inline
as you go.

## 0. Prerequisites

- [ ] Migration `supabase/migrations/20260515_campaign_sessions_module.sql`
      applied successfully (seven new tables, RLS policies, triggers).
- [ ] `npm run seed:campaigns:all` completed with no errors. Verify in
      Supabase: `party_membership` has 50 rows, `campaign_sessions` has 20,
      `volunteers` has 30.
- [ ] SAM stack `ps-upload-api-prod` redeployed; `VolunteerOpsFunction`
      and `VolunteerEmailFunction` both visible in the Lambda console.
- [ ] `VolunteerTokenSecret` parameter is set (non-empty) in the deployed
      stack. Confirm by checking the Lambda env vars in the console.
- [ ] Frontend redeployed via Amplify; `/portal/campaigns` resolves.

## 1. Session creation form (admin login)

URL: `/portal/campaigns/create`

- [ ] All fields render with required-field markers.
- [ ] Submit with blank required fields → red error message under each
      missing field after blur.
- [ ] Enter invalid email → "Enter a valid email address" appears on blur.
- [ ] Pick an association → constituency dropdown enables and populates
      with only that association's constituencies.
- [ ] Fill the form, set status=Published, submit → redirects to
      `/portal/campaigns/<new id>`.
- [ ] New session appears in the list view at `/portal/campaigns`.

## 2. RSVP states (any authenticated user)

URL: `/portal/campaigns/<session id>`

- [ ] Pre-RSVP: button reads "I'm attending" in green, full width on mobile.
- [ ] Click RSVP → button switches to "Cancel RSVP" (outlined red)
      immediately (optimistic), RSVP count increments.
- [ ] Refresh the page → RSVP state persists.
- [ ] Click Cancel RSVP → returns to "I'm attending" and count decrements.
- [ ] Open a session at capacity → button shows "Session full" (disabled).

## 3. Volunteer sign-up — three membership scenarios

URL: `/campaign/volunteer` (public, no login)

### 3a. With a valid membership number

- [ ] Enter seeded membership number `CON-100000`.
- [ ] On blur the field shows "✓ Membership verified — you'll be
      auto-approved" (green).
- [ ] Submit the form → success card reads "You're approved. Welcome to
      the campaign."
- [ ] In Supabase, row in `volunteers` shows `status='approved'`,
      `membership_verified=true`.

### 3b. With an unrecognised membership number

- [ ] Enter `CON-999999`.
- [ ] Blur shows the amber "We couldn't match this number" message but
      submission is still allowed.
- [ ] Submit → success card reads "Your application is being reviewed."
- [ ] In Supabase, row has `status='pending'`, `approval_note` populated.

### 3c. Without a membership number

- [ ] Leave membership number blank.
- [ ] Submit → success card reads "Your application is being reviewed."
- [ ] Row in `volunteers` has `status='pending'`, `membership_number=NULL`.

## 4. Validation errors

- [ ] Submit with no email → red alert: "Enter a valid email address."
- [ ] Submit with missing required fields → specific per-field errors.
- [ ] Postcode `XX1 1XX` (unmapped prefix) → success state shows
      "We've recorded your sign-up. A coordinator will assign you to
      an association shortly." Row has `region='pending_region'`.

## 5. Map view

URL: `/portal/campaigns` with map view selected (default)

- [ ] Map renders with pin per session, coloured by session type.
- [ ] Hover a pin (or click on mobile) → SessionCard overlay appears
      with title, date, location, capacity bar.
- [ ] Click "RSVP" inside the overlay → navigates to session detail.
- [ ] Toggle to List view → grid of session cards.
- [ ] Toggle back to Map → state preserved.

## 6. Bulk upload

URL: `/portal/campaigns/bulk-upload` (Campaign Manager)

- [ ] "Download CSV template" downloads a valid template with one
      example row.
- [ ] Drop a CSV with 5 valid rows → row count shows "5 valid · 0 errors".
- [ ] Drop a CSV with 3 valid + 2 invalid → per-row error list visible,
      "Download error report" produces a CSV with `row,field,reason`
      columns.
- [ ] Click "Create N sessions" → success card shows correct counts;
      sessions appear in the list view.
- [ ] Test quoted-comma value in a row (e.g.
      `"Saturday canvass, all wards"`) — must parse correctly, not
      split into extra fields.
- [ ] Test a CSV exported from Excel on Windows (CRLF line endings) —
      must parse as expected number of rows.

## 7. Attendance confirmation (post-session)

URL: `/portal/campaigns/<id>/attendance` (session creator only)

- [ ] Only visible after the session date has passed.
- [ ] Two-column table: name+association | Attended/Did-not-attend toggle.
- [ ] Click Attended → button highlights green, "✓ saved" appears briefly.
- [ ] Click Did-not-attend → button highlights, autosaves.
- [ ] Refresh the page → state persists.
- [ ] Header counts update: "X of Y marked as attended".

## 8. Email unsubscribe

- [ ] Manually generate an unsubscribe token (or wait for a real email).
- [ ] Visit `/campaign/unsubscribe?token=<valid>` → page reads
      "You've been unsubscribed."
- [ ] Volunteer row in Supabase has `email_opt_out=true`.
- [ ] Visit `/campaign/unsubscribe?token=<expired>` → page reads
      "Link expired".
- [ ] Visit `/campaign/unsubscribe` (no token) → "We couldn't process
      that link."

## 9. Weekly email — manual trigger

```powershell
aws lambda invoke `
  --function-name ps-upload-api-prod-VolunteerEmailFunction-XXXX `
  --payload '{}' out.json
type out.json
```

- [ ] Function returns `{ sent: N, skipped: M }`.
- [ ] CloudWatch logs show one "ses_send_failed" line if SES is in
      sandbox, else successful sends.
- [ ] `volunteer_email_log` table has one row per approved+opted-in
      volunteer with the correct region and a non-empty `session_ids`
      array.
- [ ] Inspect the rendered HTML in the SES sandbox preview (or look
      at the log output) and verify:
      - Navy header reads "Political Solutions — Campaigns — <region>"
      - Each session block shows title, date, address, contact, and a
        green RSVP button
      - Footer has Unsubscribe and Privacy links

## 10. Regional visibility

- [ ] Log in as a user whose `user_permissions` association is in
      Region A. `/portal/campaigns` shows only Region A sessions.
- [ ] Log in as a user whose association is in Region B. Same page
      shows only Region B sessions — no Region A leak.
- [ ] Log in as `paul@politicalsolutions.uk` → sees all sessions
      regardless of region.

## 11. Permissions

- [ ] Non-admin user with no campaign role: cannot access
      `/portal/campaigns/create` (shows permission message).
- [ ] User with `campaign_manager` role for an association: can create
      sessions for that association only (other associations don't
      appear in the dropdown).
- [ ] Only the session creator (or admin) sees Edit / Cancel /
      Confirm attendance actions on the detail page.

## 12. Mobile (375px viewport)

Open browser devtools, set width to 375px.

- [ ] Sessions list grid collapses to a single column.
- [ ] RSVP button is full width.
- [ ] Form inputs are full width with 44px+ touch targets.
- [ ] No horizontal scrolling on any page in the module.
- [ ] Public sign-up form renders cleanly.

## Known limitations / follow-ups

- Capacity race: two simultaneous RSVPs that both pass the pre-check
  can both succeed, briefly exceeding `max_capacity`. App-layer check
  + unique constraint is acceptable for the scale (<100 per session).
- The campaign_roles grant UI is not yet built — Campaign Manager /
  Volunteer Coordinator roles must currently be seeded directly in
  Supabase via the dashboard.
- Membership verification matches on `membership_number` alone (per
  brief). Tighten to surname+postcode+number when real CCHQ data is
  available.
- WAF rate-limiting on `/volunteer/membership-check` should be
  reviewed to prevent membership-number brute-forcing.
