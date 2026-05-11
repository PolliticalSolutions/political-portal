import { supabase } from "./supabaseClient.js";

const uuidv4 = () => crypto.randomUUID();

// ============================================================================
// DASHBOARD
// ============================================================================

export async function getDashboardSummary() {
  const today = new Date().toISOString().slice(0, 10);
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const [followups, overdueTasks, hotLeads, activeProjects, pipeline] = await Promise.all([
    supabase
      .from("crm_contacts")
      .select("*")
      .eq("next_followup", today)
      .order("next_followup"),

    supabase
      .from("crm_tasks")
      .select("*")
      .lt("due_date", today)
      .not("status", "in", '("Complete","Dropped")')
      .order("due_date"),

    supabase
      .from("crm_opportunities")
      .select("*")
      .in("stage", ["Demo_booked", "Proposal_sent", "Negotiating"])
      .lte("expected_close_date", in7Days)
      .order("expected_close_date"),

    supabase
      .from("crm_projects")
      .select("*")
      .eq("status", "Active")
      .order("start_date", { ascending: false }),

    supabase
      .from("crm_opportunities")
      .select("stage, estimated_value, probability_percent")
      .not("stage", "in", '("Won","Lost","Parked")'),
  ]);

  // Aggregate pipeline by stage client-side
  const pipelineMap = {};
  for (const row of pipeline.data || []) {
    if (!pipelineMap[row.stage]) {
      pipelineMap[row.stage] = { stage: row.stage, count: 0, total_value: 0, probability_sum: 0 };
    }
    pipelineMap[row.stage].count += 1;
    pipelineMap[row.stage].total_value += Number(row.estimated_value || 0);
    pipelineMap[row.stage].probability_sum += Number(row.probability_percent || 0);
  }
  const pipelineRows = Object.values(pipelineMap).map((r) => ({
    ...r,
    avg_probability: r.count ? Math.round(r.probability_sum / r.count) : 0,
  }));

  return {
    todays_followups: followups.data || [],
    overdue_tasks: overdueTasks.data || [],
    hot_leads: hotLeads.data || [],
    active_projects: activeProjects.data || [],
    pipeline: pipelineRows,
  };
}

// ============================================================================
// CONTACTS
// ============================================================================

export async function getContacts({ search = "", contactType = "", relationship = "", limit = 50, offset = 0 } = {}) {
  let q = supabase
    .from("crm_contacts")
    .select("*, crm_organisations(name)", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) {
    q = q.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%`);
  }
  if (contactType) q = q.eq("contact_type", contactType);
  if (relationship) q = q.eq("relationship_strength", relationship);

  const { data, error, count } = await q;
  if (error) throw error;
  return { contacts: data || [], total: count || 0 };
}

export async function getContact(id) {
  const [contact, interactions, notes, opportunities] = await Promise.all([
    supabase.from("crm_contacts").select("*, crm_organisations(name)").eq("id", id).single(),
    supabase.from("crm_interactions").select("*").eq("contact_id", id).order("interaction_date", { ascending: false }).limit(20),
    supabase.from("crm_notes").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    supabase.from("crm_opportunities").select("*").eq("contact_id", id).order("updated_at", { ascending: false }),
  ]);

  if (contact.error) throw contact.error;
  return {
    ...contact.data,
    interactions: interactions.data || [],
    notes: notes.data || [],
    opportunities: opportunities.data || [],
  };
}

export async function createContact(data) {
  const id = uuidv4();
  const { error } = await supabase.from("crm_contacts").insert({
    id,
    first_name: data.first_name || null,
    last_name: data.last_name || null,
    email: data.email || null,
    phone: data.phone || null,
    contact_type: data.contact_type || "Other",
    influence_level: data.influence_level || "Medium",
    relationship_strength: data.relationship_strength || "Cold",
    current_organisation_id: data.current_organisation_id || null,
    next_followup: data.next_followup || null,
  });
  if (error) throw error;
  return id;
}

export async function updateContact(id, data) {
  const allowed = ["first_name", "last_name", "email", "phone", "contact_type",
    "influence_level", "relationship_strength", "current_organisation_id", "next_followup"];
  const patch = {};
  for (const key of allowed) {
    if (key in data) patch[key] = data[key];
  }
  patch.updated_at = new Date().toISOString();
  const { error } = await supabase.from("crm_contacts").update(patch).eq("id", id);
  if (error) throw error;
}

// ============================================================================
// ORGANISATIONS
// ============================================================================

export async function getOrganisations({ search = "", orgType = "", limit = 50, offset = 0 } = {}) {
  let q = supabase
    .from("crm_organisations")
    .select("*")
    .order("name")
    .range(offset, offset + limit - 1);

  if (search) q = q.ilike("name", `%${search}%`);
  if (orgType) q = q.eq("organisation_type", orgType);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createOrganisation(data) {
  const id = uuidv4();
  const { error } = await supabase.from("crm_organisations").insert({
    id,
    name: data.name,
    organisation_type: data.organisation_type || "Other",
    email: data.email || null,
    phone: data.phone || null,
    website: data.website || null,
  });
  if (error) throw error;
  return id;
}

// ============================================================================
// OPPORTUNITIES
// ============================================================================

export async function getOpportunities({ stage = "", contactId = "" } = {}) {
  let q = supabase
    .from("crm_opportunities")
    .select("*, crm_contacts(first_name, last_name), crm_organisations(name)")
    .order("expected_close_date");

  if (stage) q = q.eq("stage", stage);
  if (contactId) q = q.eq("contact_id", contactId);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createOpportunity(data) {
  const id = uuidv4();
  const { error } = await supabase.from("crm_opportunities").insert({
    id,
    title: data.title,
    contact_id: data.contact_id,
    organisation_id: data.organisation_id || null,
    service_type: data.service_type || "Other",
    stage: data.stage || "Identified",
    estimated_value: data.estimated_value || null,
    expected_close_date: data.expected_close_date || null,
    probability_percent: data.probability_percent || 50,
  });
  if (error) throw error;
  return id;
}

export async function updateOpportunity(id, data) {
  const allowed = ["stage", "estimated_value", "expected_close_date",
    "probability_percent", "blockers", "notes", "lost_reason", "lost_date"];
  const patch = {};
  for (const key of allowed) {
    if (key in data) patch[key] = data[key];
  }
  patch.updated_at = new Date().toISOString();
  const { error } = await supabase.from("crm_opportunities").update(patch).eq("id", id);
  if (error) throw error;
}

// ============================================================================
// TASKS
// ============================================================================

export async function getTasks({ status = "", contactId = "", projectId = "", overdueOnly = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);

  let q = supabase
    .from("crm_tasks")
    .select("*")
    .order("priority")
    .order("due_date");

  if (status) q = q.eq("status", status);
  if (contactId) q = q.eq("contact_id", contactId);
  if (projectId) q = q.eq("project_id", projectId);
  if (overdueOnly) {
    q = q.lt("due_date", today).not("status", "in", '("Complete","Dropped")');
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createTask(data) {
  const id = uuidv4();
  const { error } = await supabase.from("crm_tasks").insert({
    id,
    title: data.title,
    description: data.description || null,
    status: data.status || "To_do",
    priority: data.priority || 2,
    due_date: data.due_date || null,
    contact_id: data.contact_id || null,
    organisation_id: data.organisation_id || null,
    opportunity_id: data.opportunity_id || null,
    project_id: data.project_id || null,
  });
  if (error) throw error;
  return id;
}

export async function updateTask(id, data) {
  const allowed = ["status", "priority", "due_date", "title", "description", "notes"];
  const patch = {};
  for (const key of allowed) {
    if (key in data) patch[key] = data[key];
  }
  patch.updated_at = new Date().toISOString();
  const { error } = await supabase.from("crm_tasks").update(patch).eq("id", id);
  if (error) throw error;
}

// ============================================================================
// PROJECTS
// ============================================================================

export async function getProjects({ status = "", projectType = "" } = {}) {
  let q = supabase
    .from("crm_projects")
    .select("*")
    .order("start_date", { ascending: false });

  if (status) q = q.eq("status", status);
  if (projectType) q = q.eq("project_type", projectType);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createProject(data) {
  const id = uuidv4();
  const { error } = await supabase.from("crm_projects").insert({
    id,
    name: data.name,
    project_type: data.project_type || "Admin_Ops",
    status: data.status || "Idea",
    description: data.description || null,
  });
  if (error) throw error;
  return id;
}

// ============================================================================
// NOTES
// ============================================================================

export async function createNote(data) {
  const id = uuidv4();
  const { error } = await supabase.from("crm_notes").insert({
    id,
    content: data.content,
    note_type: data.note_type || "General_Note",
    colour: data.colour || "Blue",
    contact_id: data.contact_id || null,
    organisation_id: data.organisation_id || null,
    opportunity_id: data.opportunity_id || null,
    project_id: data.project_id || null,
  });
  if (error) throw error;
  return id;
}

// ============================================================================
// INTERACTIONS
// ============================================================================

export async function createInteraction(data) {
  const id = uuidv4();
  const { error } = await supabase.from("crm_interactions").insert({
    id,
    contact_id: data.contact_id,
    organisation_id: data.organisation_id || null,
    interaction_type: data.interaction_type || "Note",
    summary: data.summary || null,
    interaction_date: data.interaction_date || new Date().toISOString(),
  });
  if (error) throw error;
  return id;
}
