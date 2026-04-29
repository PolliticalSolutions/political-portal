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

const getAuthHeaders = () => {
  try {
    const raw = sessionStorage.getItem("cognito_tokens");
    if (!raw) return {};
    const tokens = JSON.parse(raw);
    const token = tokens?.access_token || tokens?.id_token;
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
};

export const createJob = async (payload) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  return fetchJson(`${base}/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
};

const ME_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _meCache = null; // { data, expiresAt }

export const clearMeCache = () => {
  _meCache = null;
};

export const getMe = async () => {
  if (_meCache && Date.now() < _meCache.expiresAt) {
    return _meCache.data;
  }
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  const data = await fetchJson(`${base}/me`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
  _meCache = { data, expiresAt: Date.now() + ME_TTL_MS };
  return data;
};

export const getAdminMe = async () => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  return fetchJson(`${base}/admin/me`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
};

export const listAdminUsers = async ({ status = "APPROVED", limit = 50 } = {}) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  const params = new URLSearchParams({
    status,
    limit: String(limit),
  });
  return fetchJson(`${base}/admin/users?${params.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
};

export const approveAdminUser = async (userId, payload) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  if (!userId) throw new Error("Missing user ID.");
  return fetchJson(`${base}/admin/users/${encodeURIComponent(userId)}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
};

export const rejectAdminUser = async (userId, payload = {}) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  if (!userId) throw new Error("Missing user ID.");
  return fetchJson(`${base}/admin/users/${encodeURIComponent(userId)}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
};

export const applyForApproval = async (payload) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  return fetchJson(`${base}/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
};

export const createOnboardingAccount = async (payload) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  return fetchJson(`${base}/onboarding/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const listOrganisations = async ({ orgType = "ASSOCIATION", active = true } = {}) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  const params = new URLSearchParams({
    orgType,
    active: active ? "true" : "false",
  });
  return fetchJson(`${base}/organisations?${params.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
};

export const listElections = async (statusesOrOptions = ["OPEN", "UPCOMING"], maybePconCodes = []) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  const statuses = Array.isArray(statusesOrOptions)
    ? statusesOrOptions
    : Array.isArray(statusesOrOptions?.statuses)
      ? statusesOrOptions.statuses
      : ["OPEN", "UPCOMING"];
  const pconCodes = Array.isArray(statusesOrOptions)
    ? maybePconCodes
    : Array.isArray(statusesOrOptions?.pconCodes)
      ? statusesOrOptions.pconCodes
      : [];
  const params = new URLSearchParams({ status: statuses.join(",") });
  if (Array.isArray(pconCodes) && pconCodes.length > 0) {
    params.set("pconCodes", pconCodes.join(","));
  }
  return fetchJson(`${base}/elections?${params.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
};

export const runAdminElectionSync = async (payload = {}) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  return fetchJson(`${base}/admin/elections/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
};

export const listManualReviewJobs = async ({ status = "OPEN", limit = 50, cursor = "" } = {}) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  const params = new URLSearchParams({
    status,
    limit: String(limit),
    ...(cursor ? { cursor } : {}),
  });
  return fetchJson(`${base}/admin/manual-review/jobs?${params.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
};

export const getManualReviewJob = async (jobId) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  if (!jobId) throw new Error("Missing job ID.");
  return fetchJson(`${base}/admin/manual-review/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
};

export const resolveManualReviewJob = async (jobId, payload) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  if (!jobId) throw new Error("Missing job ID.");
  return fetchJson(`${base}/admin/manual-review/jobs/${encodeURIComponent(jobId)}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
};

export const listJobs = async (limit = 25) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  const params = new URLSearchParams({ limit: String(limit) });
  return fetchJson(`${base}/jobs?${params.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
};

export const getJob = async (jobId) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  if (!jobId) throw new Error("Missing job ID.");
  return fetchJson(`${base}/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
};

export const getDownloadUrls = async (jobId) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  if (!jobId) throw new Error("Missing job ID.");
  return fetchJson(`${base}/jobs/${encodeURIComponent(jobId)}/download`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
};
