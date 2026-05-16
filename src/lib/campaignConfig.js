// Module-level constants for the campaign module. Centralised so non-code
// stakeholders can request URL or copy changes without hunting through
// component files. Mirror at infra/upload-api/src/lib/campaignConfig.mjs
// for server-side handlers and email templates.

export const JOIN_PARTY_URL = "https://www.conservatives.com/join";

export const VOLUNTEER_SIGNUP_FROM_NAME = "Political Solutions Campaigns";
export const VOLUNTEER_EMAIL_SUBJECT_PREFIX = "Campaign sessions near you — week of";
export const DEFAULT_PENDING_REGION = "pending_region";
export const ADMIN_EMAIL_OVERRIDE = "paul@politicalsolutions.uk";

export const SESSION_TYPE_LABELS = {
  canvass: "Canvass",
  leaflet: "Leaflet",
  phone_bank: "Phone Bank",
  committee_room: "Committee Room",
  gotv: "GOTV",
  gotpv: "GOTPV",
  other: "Other",
};

export const SESSION_TYPE_COLOURS = {
  canvass: "#4A90D9",
  leaflet: "#64B5A0",
  phone_bank: "var(--portal-slate)",
  committee_room: "var(--portal-navy)",
  gotv: "#E67E22",      // warm amber — signals urgency
  gotpv: "#5D7DB5",     // steel blue — brand-safe (avoids purple)
  other: "var(--portal-text-muted)",
};

export const SESSION_TYPE_ORDER = [
  "canvass", "leaflet", "phone_bank", "committee_room",
  "gotv", "gotpv", "other",
];

export const STATUS_LABELS = {
  draft: "Draft",
  published: "Published",
  cancelled: "Cancelled",
};

export const ATTENDANCE_LABELS = {
  pending: "Pending",
  attended: "Attended",
  did_not_attend: "Did not attend",
};

// Campaign context — the WHY of a session (vs session_types which are the WHAT).
// Required field on every session. Backs the new filter on the homepage.
export const CAMPAIGN_CONTEXT_LABELS = {
  general_campaigning: "General campaigning",
  by_election:         "By-election",
  local_election:      "Local election",
  general_election:    "General election",
  mayoral_election:    "Mayoral election",
  pcc_election:        "PCC election",
  selection_contest:   "Selection contest",
  membership_drive:    "Membership drive",
  referendum:          "Referendum",
};

export const CAMPAIGN_CONTEXT_ORDER = [
  "general_campaigning",
  "by_election",
  "local_election",
  "general_election",
  "mayoral_election",
  "pcc_election",
  "selection_contest",
  "membership_drive",
  "referendum",
];

export const HEARD_VIA_LABELS = {
  association: "Through my association",
  social_media: "Social media",
  friend: "Friend or colleague",
  email: "Email",
  other: "Other",
};

// CSV bulk-upload template — single source of truth shared by the
// Bulk Upload page and the "Download template" link on the Create page.
export const SESSION_CSV_TEMPLATE_HEADERS = [
  "title",
  "session_types",          // pipe-delimited, e.g. canvass|gotv
  "campaign_context",       // one of CAMPAIGN_CONTEXT_ORDER values
  "association_name",       // optional — falls back to selected default
  "constituency_name",
  "venue_name",
  "street_address",
  "postcode",
  "session_date",           // YYYY-MM-DD
  "start_time",             // HH:MM
  "duration_minutes",
  "contact_name",
  "contact_phone",
  "contact_email",
  "max_capacity",           // blank for unlimited
  "notes",
];

export const SESSION_CSV_TEMPLATE_SAMPLE = [
  [
    "Saturday morning canvass",
    "canvass|gotv",
    "general_campaigning",
    "Camberwell and Peckham Conservatives",
    "Camberwell and Peckham",
    "Volunteer HQ",
    "14 High Street, London",
    "SW1A 1AA",
    "2026-06-07",
    "10:00",
    "180",
    "Sarah Henderson",
    "020 7123 4567",
    "sarah@example.org",
    "20",
    "Bring waterproofs",
  ],
];

export const SESSION_CSV_TEMPLATE_FILENAME = "campaign-sessions-template.csv";
