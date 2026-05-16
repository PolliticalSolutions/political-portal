// HTML email templates for the volunteer weekly programme.
// Design system colours only (navy, slate, green CTA). Inline styles
// because email clients ignore stylesheets. No images.

const NAVY = "#0F2744";
const SLATE = "#4A5C6E";
const CTA = "#1A6B3C";
const BG = "#F4F6F8";
const SURFACE = "#FFFFFF";
const BORDER = "#D8DDE3";
const MUTED = "#7A8A96";

const SESSION_TYPE_LABEL = {
  canvass: "Canvass",
  leaflet: "Leaflet",
  phone_bank: "Phone Bank",
  committee_room: "Committee Room",
  gotv: "GOTV",
  gotpv: "GOTPV",
  other: "Activity",
};

function primaryTypeLabel(s) {
  const types = Array.isArray(s.session_types) ? s.session_types : (s.session_type ? [s.session_type] : []);
  return SESSION_TYPE_LABEL[types[0]] || "Activity";
}

function addressLines(s) {
  const lines = [];
  if (s.venue_name) lines.push(`<strong>${esc(s.venue_name)}</strong>`);
  if (s.street_address) lines.push(esc(s.street_address));
  if (s.postcode) lines.push(esc(s.postcode));
  return lines.join("<br/>");
}

function directionsHref(s) {
  const dest = [s.street_address, s.postcode].filter(Boolean).join(", ");
  if (!dest) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function formatTime(time) {
  if (!time) return "";
  return time.slice(0, 5);
}

/**
 * Build the weekly campaign-sessions email HTML for one volunteer.
 *
 * @param {{
 *   firstName: string,
 *   region: string,
 *   sessions: Array<{ id: string, title: string, session_type: string, session_date: string, start_time: string, meeting_place: string, contact_name: string, rsvpUrl: string }>,
 *   unsubscribeUrl: string,
 *   weekOfDateLabel: string,
 * }} input
 * @returns {string}
 */
export function volunteerWeeklyHtml({ firstName, region, sessions, unsubscribeUrl, weekOfDateLabel }) {
  const sessionBlocks = sessions.map((s) => {
    const dirHref = directionsHref(s);
    return `
    <tr>
      <td style="padding: 16px 0; border-bottom: 1px solid ${BORDER};">
        <div style="font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${SLATE}; margin-bottom: 6px;">
          ${esc(primaryTypeLabel(s))}
        </div>
        <div style="font-size: 18px; font-weight: 600; color: ${NAVY}; margin-bottom: 6px;">
          ${esc(s.title)}
        </div>
        <div style="font-size: 14px; color: ${SLATE}; line-height: 1.5;">
          ${esc(formatDate(s.session_date))} at ${esc(formatTime(s.start_time))}<br/>
          ${addressLines(s)}
          ${dirHref ? `<br/><a href="${esc(dirHref)}" style="color: ${CTA}; font-weight: 600; text-decoration: none;">Get directions →</a>` : ""}
          <br/>
          Contact: ${esc(s.contact_name)}
        </div>
        <div style="margin-top: 12px;">
          <a href="${esc(s.rsvpUrl)}" style="display: inline-block; background: ${CTA}; color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 20px; border-radius: 3px;">
            RSVP to this session
          </a>
        </div>
      </td>
    </tr>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8"/>
<title>Campaign sessions near you</title>
</head>
<body style="margin: 0; padding: 0; background: ${BG}; font-family: 'Gill Sans', 'Gill Sans MT', Calibri, 'Trebuchet MS', sans-serif; color: #1A1A1A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background: ${BG}; padding: 24px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="background: ${SURFACE}; border: 1px solid ${BORDER}; border-radius: 4px;">
          <tr>
            <td style="background: ${NAVY}; padding: 24px 32px; color: #FFFFFF;">
              <div style="font-size: 20px; font-weight: 700; letter-spacing: -0.01em;">Political Solutions</div>
              <div style="font-size: 13px; color: #B8C2CE; margin-top: 2px;">Campaigns ${esc(region ? "— " + region : "")}</div>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 32px 8px 32px;">
              <p style="margin: 0 0 12px 0; font-size: 16px; color: #1A1A1A;">Hi ${esc(firstName)},</p>
              <p style="margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: ${SLATE};">
                Here are the campaign sessions coming up in your area for the week of ${esc(weekOfDateLabel)}.
                Click any session to confirm attendance — no login needed.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${sessionBlocks}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 32px 32px 32px; font-size: 12px; color: ${MUTED}; line-height: 1.6;">
              <p style="margin: 0 0 8px 0;">
                You're receiving this because you signed up as a Conservative campaign volunteer.
              </p>
              <p style="margin: 0;">
                <a href="${esc(unsubscribeUrl)}" style="color: ${SLATE};">Unsubscribe</a>
                &nbsp;·&nbsp;
                <a href="https://politicalsolutions.uk/privacy" style="color: ${SLATE};">Privacy</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function volunteerWeeklyText({ firstName, region, sessions, unsubscribeUrl, weekOfDateLabel }) {
  const lines = [
    `Hi ${firstName},`,
    "",
    `Campaign sessions coming up${region ? ` in ${region}` : ""} — week of ${weekOfDateLabel}:`,
    "",
  ];
  for (const s of sessions) {
    lines.push(`• ${primaryTypeLabel(s)} — ${s.title}`);
    lines.push(`  ${formatDate(s.session_date)} at ${formatTime(s.start_time)}`);
    if (s.venue_name) lines.push(`  ${s.venue_name}`);
    if (s.street_address) lines.push(`  ${s.street_address}`);
    if (s.postcode) lines.push(`  ${s.postcode}`);
    const dir = directionsHref(s);
    if (dir) lines.push(`  Directions: ${dir}`);
    lines.push(`  Contact: ${s.contact_name}`);
    lines.push(`  RSVP: ${s.rsvpUrl}`);
    lines.push("");
  }
  lines.push(`Unsubscribe: ${unsubscribeUrl}`);
  lines.push("Privacy: https://politicalsolutions.uk/privacy");
  return lines.join("\n");
}
