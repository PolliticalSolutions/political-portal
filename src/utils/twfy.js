export function getTwfyApiKey(env = import.meta.env) {
  const value = env?.VITE_TWFY_API_KEY;
  return typeof value === "string" ? value.trim() : "";
}

export function hasTwfyApiKey(env = import.meta.env) {
  return Boolean(getTwfyApiKey(env));
}
