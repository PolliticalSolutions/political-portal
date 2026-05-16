// Public HTTP client for the volunteer endpoints in ps-upload-api-prod.
// All four routes are PUBLIC — no Cognito auth headers attached.
//   POST /volunteer/signup              — create volunteer record
//   POST /volunteer/membership-check    — instant membership lookup (form helper)
//   POST /volunteer/rsvp                — tokenised RSVP from email link
//   GET  /volunteer/unsubscribe         — tokenised email opt-out
//
// Token-bearing endpoints expect the JWT in the request body (POST) or
// query string (GET) — the Lambda handler validates HMAC-SHA256 and expiry.

import { getRuntimeConfig } from "../config/runtimeConfig.js";

const resolveUploadApiBaseUrl = () => {
  const config = getRuntimeConfig();
  return config.uploadApiBaseUrl || "";
};

const fetchJson = async (url, options) => {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network request failed.";
    throw new Error(message);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.message || `Request failed (${response.status}).`;
    throw new Error(message);
  }
  return data;
};

/**
 * Submit a volunteer sign-up. Lambda runs the membership-number check
 * synchronously and returns the resolved status + verified flag so the
 * post-submit message can be shown without a second round trip.
 *
 * @param {{
 *   firstName: string, lastName: string, email: string,
 *   phone?: string, postcode: string,
 *   membershipNumber?: string, associationPreference?: string,
 *   heardVia?: string, consent: boolean
 * }} payload
 * @returns {Promise<{ id: string, status: "approved"|"pending"|"rejected", membershipVerified: boolean, region: string }>}
 */
export const submitVolunteerSignup = async (payload) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  return fetchJson(`${base}/volunteer/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

/**
 * Check whether a membership number matches an active party_membership row.
 * Used by the sign-up form to show inline feedback before submission.
 *
 * @param {string} membershipNumber
 * @returns {Promise<{ match: boolean }>}
 */
export const checkMembership = async (membershipNumber) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  return fetchJson(`${base}/volunteer/membership-check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ membershipNumber }),
  });
};

/**
 * Confirm a volunteer RSVP via a tokenised email link.
 *
 * @param {string} token
 * @returns {Promise<{
 *   ok: boolean,
 *   session?: object,
 *   alreadyRsvpd?: boolean,
 *   sessionFull?: boolean,
 *   expired?: boolean,
 *   cancelled?: boolean
 * }>}
 */
export const submitVolunteerRsvp = async (token) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  return fetchJson(`${base}/volunteer/rsvp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
};

/**
 * Set email_opt_out=true on a volunteer via a tokenised unsubscribe link.
 *
 * @param {string} token
 * @returns {Promise<{ ok: boolean, expired?: boolean }>}
 */
export const unsubscribeVolunteer = async (token) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  const url = new URL(`${base}/volunteer/unsubscribe`);
  url.searchParams.set("token", token);
  return fetchJson(url.toString(), { method: "GET" });
};
