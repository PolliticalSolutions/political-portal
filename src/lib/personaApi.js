import { getRuntimeConfig } from "../config/runtimeConfig.js";

const resolvePersonaApiUrl = () => {
  return getRuntimeConfig().personaApiUrl || "";
};

export async function buildPersona(mpName) {
  const url = resolvePersonaApiUrl();
  if (!url) throw new Error("Missing Persona API URL. Set VITE_PERSONA_API_URL.");
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ mpName }),
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Network request failed.");
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status}).`);
  }
  return data;
}
