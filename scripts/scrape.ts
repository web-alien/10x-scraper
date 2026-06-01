import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { load } from "cheerio";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { createScriptClient } from "@/lib/supabase-script";

const SourceSchema = z.object({
  name: z.string(),
  url: z.url(),
  selectors: z.object({
    articleLink: z.string(),
    title: z.string().optional(),
    lead: z.string().optional(),
  }),
});

const SourceConfigSchema = z.array(SourceSchema);

export type Source = z.infer<typeof SourceSchema>;
type SourceConfig = z.infer<typeof SourceConfigSchema>;

export async function processSource(
  html: string,
  source: Source,
  supabase: SupabaseClient<Database>,
): Promise<{ newCount: number; duplicateCount: number }> {
  const $ = load(html);
  const linkElements = $(source.selectors.articleLink);

  const articles: { source_url: string; article_url: string; title: string; lead: string }[] = [];

  linkElements.each((index, el) => {
    const title = source.selectors.title ? $(source.selectors.title).eq(index).text().trim() : $(el).text().trim();
    if (!title && source.selectors.title) {
      console.warn(`${source.name}: title selector matched nothing at index ${index}`);
    }
    const rawHref = $(el).attr("href");

    if (!rawHref) return;

    let article_url: string;
    try {
      article_url = new URL(rawHref, source.url).href;
    } catch {
      return;
    }

    let lead = "";
    if (source.selectors.lead) {
      lead = $(source.selectors.lead).eq(index).text().trim();
      if (!lead) {
        console.warn(`${source.name}: lead selector matched nothing at index ${index}`);
      }
    }

    articles.push({ source_url: source.url, article_url, title, lead });
  });

  if (articles.length === 0) {
    console.warn(`${source.name}: no articles found — selectors may be broken`);
    return { newCount: 0, duplicateCount: 0 };
  }

  const dbRows = articles.map(({ source_url, article_url, title, lead }) => ({
    source_url,
    article_url,
    title,
    lead,
  }));

  const { data, error } = await supabase
    .from("articles_seen")
    .upsert(dbRows, { onConflict: "source_url,article_url", ignoreDuplicates: true })
    .select("id");

  if (error) {
    console.error(`${source.name}: Supabase error: ${error.message}`);
    return { newCount: 0, duplicateCount: 0 };
  }

  const newCount = data.length;
  const duplicateCount = articles.length - newCount;
  return { newCount, duplicateCount };
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env");
    process.exit(1);
  }

  let sources: SourceConfig;
  try {
    const raw = readFileSync("sources.json", "utf-8");
    sources = SourceConfigSchema.parse(JSON.parse(raw));
  } catch (err) {
    console.error("Error loading sources.json:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const supabase = createScriptClient(supabaseUrl, supabaseServiceRoleKey);

  console.log("Scraper starting…");

  let totalNew = 0;
  let totalDuplicates = 0;

  for (const source of sources) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, 10_000);

      let html: string;
      // AbortController only aborts the TCP connection phase; response.text() body read
      // is not bounded by the signal. Accepted limitation for manually-run news scraping.
      try {
        const response = await fetch(source.url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        html = await response.text();
      } finally {
        clearTimeout(timeout);
      }

      const { newCount, duplicateCount } = await processSource(html, source, supabase);
      totalNew += newCount;
      totalDuplicates += duplicateCount;
      if (newCount > 0 || duplicateCount > 0) {
        console.log(`${source.name}: ${newCount} nowych, ${duplicateCount} duplikatów`);
      }
    } catch (err) {
      console.error(`${source.name}: Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log("---");
  console.log(`Łącznie: ${totalNew} nowych, ${totalDuplicates} duplikatów`);
}
