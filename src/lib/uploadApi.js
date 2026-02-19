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

export const getMe = async () => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  return fetchJson(`${base}/me`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
};

export const getAdminMe = async () => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  return fetchJson(`${base}/admin/me`, {
    method: "GET",
    headers: getAuthHeaders(),
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

export const listElections = async (pconCode, statuses = ["OPEN", "UPCOMING"]) => {
  const base = resolveUploadApiBaseUrl();
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");
  if (!pconCode) throw new Error("Missing pconCode.");
  const params = new URLSearchParams({
    pconCode,
    status: statuses.join(","),
  });
  return fetchJson(`${base}/elections?${params.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
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
