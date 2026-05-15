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
  other: "Other",
};

export const SESSION_TYPE_COLOURS = {
  canvass: "#4A90D9",
  leaflet: "#64B5A0",
  phone_bank: "var(--portal-slate)",
  committee_room: "var(--portal-navy)",
  other: "var(--portal-text-muted)",
};

export const SESSION_TYPE_ORDER = ["canvass", "leaflet", "phone_bank", "committee_room", "other"];

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

export const HEARD_VIA_LABELS = {
  association: "Through my association",
  social_media: "Social media",
  friend: "Friend or colleague",
  email: "Email",
  other: "Other",
};
