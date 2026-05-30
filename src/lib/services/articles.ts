import type { SupabaseClient } from "@supabase/supabase-js";

export async function fetchArticles(supabase: SupabaseClient) {
  return supabase
    .from("articles_seen")
    .select("id, source_url, article_url, title, lead, seen_at, digest_sent_at")
    .order("seen_at", { ascending: false })
    .limit(50);
}
