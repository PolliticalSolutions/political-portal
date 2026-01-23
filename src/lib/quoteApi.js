const resolveApiBaseUrl = () => {
  const base =
    import.meta.env.VITE_API_BASE_URL?.trim() || import.meta.env.VITE_ENQUIRY_API_URL?.trim();
  if (!base) return "";
  return base.replace(/\/+$/, "");
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
  } catch (error) {
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

export const getXeroStatus = async ({ withAuth = false } = {}) => {
  const base = resolveApiBaseUrl();
  if (!base) {
    return { ok: true, connected: false };
  }
  const headers = withAuth ? getAuthHeaders() : undefined;
  return fetchJson(`${base}/xero/status`, { method: "GET", headers });
};

export const getXeroConnectUrl = () => {
  const base = resolveApiBaseUrl();
  if (!base) {
    throw new Error("Missing API base URL.");
  }
  return `${base}/xero/connect?mode=json`;
};

export const startXeroConnect = () => {
  const url = getXeroConnectUrl();
  const headers = getAuthHeaders();
  return fetchJson(url, { method: "GET", headers }).then((data) => {
    const redirectUrl = data?.url;
    if (!redirectUrl) {
      throw new Error("Missing Xero redirect URL.");
    }
    if (redirectUrl && typeof window !== "undefined") {
      window.location.assign(redirectUrl);
    }
    return redirectUrl;
  });
};

export const postQuoteRequest = async (payload) => {
  const base = resolveApiBaseUrl();
  if (!base) {
    throw new Error("Missing API base URL.");
  }
  return fetchJson(`${base}/quote-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const postServiceEnquiry = async (payload) => {
  const base = resolveApiBaseUrl();
  if (!base) {
    throw new Error("Missing API base URL.");
  }
  return fetchJson(`${base}/enquiry/service-support`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const getQuoteRequest = async (referenceId) => {
  const base = resolveApiBaseUrl();
  if (!base) {
    throw new Error("Missing API base URL.");
  }
  if (!referenceId) {
    throw new Error("Missing reference id.");
  }
  return fetchJson(`${base}/quote-requests/${encodeURIComponent(referenceId)}`, {
    method: "GET",
  });
};

export const getQuoteRequests = async ({ limit = 20, lastKey = "" } = {}) => {
  const base = resolveApiBaseUrl();
  if (!base) {
    throw new Error("Missing API base URL.");
  }
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (lastKey) params.set("lastKey", lastKey);
  return fetchJson(`${base}/quote-requests?${params.toString()}`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
};

export const getQuoteRequestAdmin = async (referenceId) => {
  const base = resolveApiBaseUrl();
  if (!base) {
    throw new Error("Missing API base URL.");
  }
  if (!referenceId) {
    throw new Error("Missing reference id.");
  }
  return fetchJson(`${base}/quote-requests/${encodeURIComponent(referenceId)}/admin`, {
    method: "GET",
    headers: getAuthHeaders(),
  });
};

export const createServiceInvoice = async (referenceId, payload) => {
  const base = resolveApiBaseUrl();
  if (!base) {
    throw new Error("Missing API base URL.");
  }
  if (!referenceId) {
    throw new Error("Missing reference id.");
  }
  return fetchJson(`${base}/ops/quotes/${encodeURIComponent(referenceId)}/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });
};

export const createTestInvoice = async () => {
  const base = resolveApiBaseUrl();
  if (!base) {
    throw new Error("Missing API base URL.");
  }
  return fetchJson(`${base}/xero/test-invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({}),
  });
};
