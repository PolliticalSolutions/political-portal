import { getApiBaseUrl } from "../config/runtimeConfig.js";

const TIMEOUT_MS = 12000;

export function createConferenceSession() {
  let visitId;
  let visitPromise;
  let attempt;

  async function request(path, payload) {
    const base = getApiBaseUrl();
    if (!base) throw new Error("The form is temporarily unavailable. Please use the contact details below.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${base}/conference/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        signal: controller.signal,
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Your details could not be saved. Please try again or contact Paul below.");
      }
      return result;
    } catch (error) {
      if (error.name === "AbortError" || error instanceof TypeError) {
        throw new Error("We could not confirm your submission. Please try Send again or contact Paul below.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    visit() {
      visitId ||= crypto.randomUUID();
      // Reuse both the promise and ID for StrictMode, reconnects and retries.
      visitPromise ||= request("visit", { visitId }).catch((error) => {
        visitPromise = null;
        throw error;
      });
      return visitPromise;
    },
    async submit(fields) {
      const fingerprint = JSON.stringify(fields);
      if (!attempt || attempt.fingerprint !== fingerprint) {
        attempt = { fingerprint, id: crypto.randomUUID() };
      }
      const { token } = await this.visit();
      return request("leads", { ...fields, token, requestId: attempt.id });
    },
  };
}
