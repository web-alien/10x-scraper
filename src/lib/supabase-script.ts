import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

export function createScriptClient(url: string, serviceRoleKey: string) {
  return createClient<Database>(url, serviceRoleKey);
}
