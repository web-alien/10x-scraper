import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecipientInput } from "@/lib/validators/recipient";

const COLUMNS = "id, email, name, status, created_at, updated_at";

export async function fetchRecipients(supabase: SupabaseClient) {
  return supabase.from("mailing_recipients").select(COLUMNS).order("created_at", { ascending: false });
}

export async function createRecipient(supabase: SupabaseClient, data: RecipientInput) {
  return supabase
    .from("mailing_recipients")
    .insert({ email: data.email, name: data.name ?? null, status: data.status })
    .select(COLUMNS)
    .single();
}

export async function updateRecipient(supabase: SupabaseClient, id: string, data: RecipientInput) {
  return supabase
    .from("mailing_recipients")
    .update({
      email: data.email,
      name: data.name ?? null,
      status: data.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(COLUMNS)
    .single();
}

export async function deleteRecipient(supabase: SupabaseClient, id: string) {
  return supabase.from("mailing_recipients").delete().eq("id", id).select("id");
}
