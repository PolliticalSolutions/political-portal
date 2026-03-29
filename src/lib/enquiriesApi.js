import { supabase } from "./supabaseClient.js";

export async function insertEnquiry({ name, email, organisation, services_interested, role, message }) {
  const { error } = await supabase.from("enquiries").insert({
    name,
    email,
    organisation: organisation || null,
    services_interested: services_interested?.length ? services_interested : null,
    role: role || null,
    message: message || null,
  });
  if (error) throw error;
}
