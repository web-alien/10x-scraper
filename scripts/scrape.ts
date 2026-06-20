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

/**
 * Wyprowadza selektor KARTY (kontenera artykułu) ze wspólnego, wiodącego prefiksu selektorów
 * (tokenów rozdzielonych spacją). Dla parkiet articleLink/title/lead zaczynają się od ".content--block",
 * więc kontener = ".content--block". Tytuł/lead leżą na poziomie karty, nie wewnątrz linku — dlatego
 * skopujemy się do karty (`$(el).closest(container)`), a nie do pojedynczego linku.
 */
export function commonContainer(...selectors: (string | undefined)[]): string {
  const tokenized = selectors.filter((s): s is string => !!s).map((s) => s.trim().split(/\s+/));
  if (tokenized.length === 0) return "";
  let prefix = tokenized[0];
  for (const tokens of tokenized.slice(1)) {
    let i = 0;
    while (i < prefix.length && i < tokens.length && prefix[i] === tokens[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix.join(" ");
}

/** Zdejmuje prefiks kontenera z selektora, dając formę relatywną do karty (lub całość, gdy brak prefiksu). */
export function relativeToContainer(selector: string, container: string): string {
  if (!container) return selector;
  const sel = selector.trim().split(/\s+/);
  const con = container.trim().split(/\s+/);
  return con.every((t, i) => sel[i] === t) ? sel.slice(con.length).join(" ") : selector;
}

export async function processSource(
  html: string,
  source: Source,
  supabase: SupabaseClient<Database>,
): Promise<{ newCount: number; duplicateCount: number }> {
  const $ = load(html);
  const linkElements = $(source.selectors.articleLink);

  // Tytuł/lead leżą na poziomie KARTY (kontenera artykułu), nie wewnątrz linku. Kontener wyprowadzamy
  // ze wspólnego prefiksu selektorów; dla każdego linku skopujemy się do jego najbliższej karty.
  const container = commonContainer(source.selectors.articleLink, source.selectors.title, source.selectors.lead);
  const relTitle = source.selectors.title ? relativeToContainer(source.selectors.title, container) : "";
  const relLead = source.selectors.lead ? relativeToContainer(source.selectors.lead, container) : "";

  const articles: { source_url: string; article_url: string; title: string | null; lead: string | null }[] = [];

  linkElements.each((index, el) => {
    const $el = $(el);
    const card = container ? $el.closest(container) : $el;
    // Brak tekstu → null (nie ""), żeby fallback `?? article_url` u konsumentów zadziałał.
    const pick = (selector: string | undefined, rel: string): string | null => {
      if (!selector) return $el.text().trim() || null;
      const scope = rel ? card.find(rel) : card;
      return scope.first().text().trim() || null;
    };

    const title = pick(source.selectors.title, relTitle);
    if (!title && source.selectors.title) {
      console.warn(`${source.name}: title selector matched nothing at index ${index}`);
    }

    const rawHref = $el.attr("href");
    if (!rawHref) return;

    let article_url: string;
    try {
      article_url = new URL(rawHref, source.url).href;
    } catch {
      return;
    }

    let lead: string | null = null;
    if (source.selectors.lead) {
      lead = pick(source.selectors.lead, relLead);
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
    throw new Error(`Supabase upsert failed: ${error.message}`);
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
  let hasErrors = false;

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
      hasErrors = true;
    }
  }

  console.log("---");
  console.log(`Łącznie: ${totalNew} nowych, ${totalDuplicates} duplikatów`);
  if (hasErrors) process.exit(1);
}
