import { getRuntimeConfig } from "../config/runtimeConfig.js";
import { getSupabaseServiceClient } from "./supabaseServiceClient.js";
import { isAdmin as checkIsAdmin } from "./subscriptionApi.js";

const POLL_INTERVAL_MS = 5000;
const POLL_DEADLINE_MS = 10 * 60 * 1000;
const POLL_FAILURE_LIMIT = 6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

function getPersonaBase() {
  const base = getRuntimeConfig().personaApiUrl;
  if (!base) {
    throw new Error("Missing Persona API URL. Set VITE_PERSONA_API_URL.");
  }
  return base;
}

async function startJob(payload) {
  const base = getPersonaBase();
  let response;
  try {
    response = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Network request failed.");
  }
  if (!response.ok) {
    const data = await parseJson(response);
    throw new Error(data?.error || `Failed to start job (${response.status}).`);
  }
  const data = await parseJson(response);
  const jobId = data?.jobId;
  if (!jobId) throw new Error("Persona job did not return a job ID.");
  return jobId;
}

async function pollJob(jobId) {
  const base = getPersonaBase();
  const deadline = Date.now() + POLL_DEADLINE_MS;
  let failures = 0;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    let response;
    try {
      response = await fetch(`${base}/${encodeURIComponent(jobId)}`, {
        headers: { Accept: "application/json" },
      });
    } catch {
      failures += 1;
      if (failures >= POLL_FAILURE_LIMIT) {
        throw new Error("Lost connection while waiting for persona generation.");
      }
      continue;
    }
    if (!response.ok) {
      failures += 1;
      if (failures >= POLL_FAILURE_LIMIT) {
        throw new Error(`Persona polling failed (${response.status}).`);
      }
      continue;
    }
    failures = 0;
    const job = await parseJson(response);
    if (job?.status === "complete") return job;
    if (job?.status === "error") {
      throw new Error(job.error || "Persona generation failed.");
    }
  }

  throw new Error("Timed out waiting for persona (10 min).");
}

async function userHasFeature(cognitoSub) {
  if (!cognitoSub) return false;
  const db = getSupabaseServiceClient();
  if (!db) {
    throw new Error("Supabase service client not available.");
  }
  const { data, error } = await db
    .from("user_permissions")
    .select("feature_mp_persona")
    .eq("cognito_sub", cognitoSub)
    .eq("is_active", true)
    .eq("feature_mp_persona", true)
    .limit(1);
  if (error) {
    throw new Error(error.message || "Failed to check MP Persona permission.");
  }
  return Array.isArray(data) && data.length > 0;
}

async function ensureAccessOrAdmin(cognitoSub) {
  let admin = false;
  try {
    admin = await checkIsAdmin(cognitoSub);
  } catch {
    admin = false;
  }
  if (admin) return true;
  const allowed = await userHasFeature(cognitoSub);
  if (!allowed) {
    throw new Error("MP Persona access not enabled for this account.");
  }
  return true;
}

async function upsertPersona({ cognitoSub, mpName, onsCode, systemPrompt }) {
  const db = getSupabaseServiceClient();
  if (!db) throw new Error("Supabase service client not available.");

  const { data: existing, error: lookupError } = await db
    .from("mp_personas")
    .select("id")
    .eq("cognito_sub", cognitoSub)
    .eq("constituency_ons_code", onsCode)
    .maybeSingle();

  if (lookupError) {
    throw new Error(lookupError.message || "Failed to look up persona.");
  }

  if (existing?.id) {
    const { data, error } = await db
      .from("mp_personas")
      .update({
        mp_name: mpName,
        system_prompt: systemPrompt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("id")
      .single();
    if (error) throw new Error(error.message || "Failed to save persona.");
    return data.id;
  }

  const { data, error } = await db
    .from("mp_personas")
    .insert({
      cognito_sub: cognitoSub,
      mp_name: mpName,
      constituency_ons_code: onsCode,
      system_prompt: systemPrompt,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message || "Failed to save persona.");
  return data.id;
}

export async function buildPersona(mpName, onsCode, cognitoSub) {
  const name = (mpName || "").trim();
  const ons = (onsCode || "").trim();
  const sub = (cognitoSub || "").trim();
  if (!name) throw new Error("MP name is required.");
  if (!ons) throw new Error("Constituency code is required.");
  if (!sub) throw new Error("Authenticated user is required.");

  await ensureAccessOrAdmin(sub);

  const jobId = await startJob({ mode: "persona", mpName: name, onsCode: ons });
  const job = await pollJob(jobId);
  const systemPrompt = job?.systemPrompt;
  if (!systemPrompt) {
    throw new Error("Persona generation completed without a system prompt.");
  }
  const resolvedName = job?.mpName || name;
  const personaId = await upsertPersona({
    cognitoSub: sub,
    mpName: resolvedName,
    onsCode: ons,
    systemPrompt,
  });
  return { systemPrompt, mpName: resolvedName, personaId };
}

export async function generateDraft({ systemPrompt, outputType, context }) {
  if (!systemPrompt) throw new Error("System prompt is required.");
  if (!outputType) throw new Error("Output type is required.");
  if (!context) throw new Error("Context is required.");

  const jobId = await startJob({ mode: "draft", systemPrompt, outputType, context });
  const job = await pollJob(jobId);
  const generatedText = job?.generatedText;
  if (!generatedText) {
    throw new Error("Draft generation completed without text.");
  }
  return { generatedText };
}

export async function saveDraft({ personaId, cognitoSub, outputType, context, generatedText }) {
  const db = getSupabaseServiceClient();
  if (!db) throw new Error("Supabase service client not available.");
  const { data, error } = await db
    .from("mp_persona_outputs")
    .insert({
      persona_id: personaId,
      cognito_sub: cognitoSub,
      output_type: outputType,
      context_provided: context,
      generated_text: generatedText,
    })
    .select("id, persona_id, cognito_sub, output_type, context_provided, generated_text, created_at")
    .single();
  if (error) throw new Error(error.message || "Failed to save draft.");
  return data;
}

export async function listDrafts(cognitoSub) {
  if (!cognitoSub) return [];
  const db = getSupabaseServiceClient();
  if (!db) return [];
  const { data, error } = await db
    .from("mp_persona_outputs")
    .select("id, persona_id, output_type, context_provided, generated_text, created_at")
    .eq("cognito_sub", cognitoSub)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return [];
  return Array.isArray(data) ? data : [];
}

export async function getPersonaForUser(cognitoSub, onsCode) {
  if (!cognitoSub || !onsCode) return null;
  const db = getSupabaseServiceClient();
  if (!db) return null;
  const { data, error } = await db
    .from("mp_personas")
    .select("id, mp_name, constituency_ons_code, system_prompt, updated_at")
    .eq("cognito_sub", cognitoSub)
    .eq("constituency_ons_code", onsCode)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function getPermittedMpForUser(cognitoSub) {
  if (!cognitoSub) return null;
  const db = getSupabaseServiceClient();
  if (!db) return null;

  const { data: perms, error: permsError } = await db
    .from("user_permissions")
    .select("association_id")
    .eq("cognito_sub", cognitoSub)
    .eq("is_active", true);
  if (permsError || !perms?.length) return null;

  const associationIds = Array.from(
    new Set(perms.map((p) => p.association_id).filter(Boolean))
  );
  if (associationIds.length === 0) return null;

  const { data: links, error: linksError } = await db
    .from("association_constituencies")
    .select("constituency_id")
    .in("association_id", associationIds);
  if (linksError || !links?.length) return null;

  const constituencyIds = Array.from(
    new Set(links.map((l) => l.constituency_id).filter(Boolean))
  );
  if (constituencyIds.length === 0) return null;

  const { data: constituencies, error: consError } = await db
    .from("constituencies")
    .select("id, name, ons_code, mp_name")
    .in("id", constituencyIds);
  if (consError || !constituencies?.length) return null;

  const match = constituencies.find(
    (row) => (row?.mp_name || "").toString().trim().length > 0 && (row?.ons_code || "").toString().trim().length > 0
  );
  if (!match) return null;

  return {
    mpName: match.mp_name.trim(),
    onsCode: match.ons_code.trim(),
    constituencyName: match.name || "",
  };
}
