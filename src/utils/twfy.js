export function getTwfyApiKey(env) {
  const processValue =
    typeof process !== "undefined" && process.env
      ? process.env.VITE_TWFY_API_KEY
      : undefined;
  const value = env
    ? env.VITE_TWFY_API_KEY
    : (import.meta.env.VITE_TWFY_API_KEY ?? processValue);
  return typeof value === "string" ? value.trim() : "";
}

export function hasTwfyApiKey(env) {
  return Boolean(getTwfyApiKey(env));
}
