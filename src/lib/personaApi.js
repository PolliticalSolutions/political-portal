import { getRuntimeConfig } from "../config/runtimeConfig.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export async function buildPersona(mpName, onProgress) {
  void onProgress;
  const base = getRuntimeConfig().uploadApiBaseUrl;
  if (!base) throw new Error("Missing Upload API URL. Set VITE_UPLOAD_API_URL.");

  let start;
  try {
    start = await fetch(`${base}/persona`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mpName }),
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Network request failed.");
  }

  if (!start.ok) {
    const data = await parseJson(start);
    throw new Error(data?.error || `Failed to start job (${start.status}).`);
  }

  const startData = await parseJson(start);
  const jobId = startData?.jobId;
  if (!jobId) throw new Error("Persona job did not return a job ID.");

  const deadline = Date.now() + 10 * 60 * 1000;
  let consecutivePollFailures = 0;

  while (Date.now() < deadline) {
    await sleep(5000);

    let poll;
    try {
      poll = await fetch(`${base}/persona/${encodeURIComponent(jobId)}`, {
        headers: { Accept: "application/json" },
      });
    } catch {
      consecutivePollFailures += 1;
      if (consecutivePollFailures >= 6) {
        throw new Error("Lost connection while waiting for persona generation.");
      }
      continue;
    }

    if (!poll.ok) {
      consecutivePollFailures += 1;
      if (consecutivePollFailures >= 6) {
        throw new Error(`Persona polling failed (${poll.status}).`);
      }
      continue;
    }

    consecutivePollFailures = 0;
    const job = await parseJson(poll);
    if (job?.status === "complete") {
      return { systemPrompt: job.systemPrompt, mpName: job.mpName };
    }
    if (job?.status === "error") {
      throw new Error(job.error || "Persona generation failed.");
    }
  }

  throw new Error("Timed out waiting for persona (10 min).");
}
