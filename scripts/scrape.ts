import "dotenv/config";
import { readFileSync } from "fs";
import { load } from "cheerio";
import { z } from "zod";
import { createScriptClient } from "@/lib/supabase-script";

const SourceConfigSchema = z.array(
  z.object({
    name: z.string(),
    url: z.url(),
    selectors: z.object({
      articleLink: z.string(),
      lead: z.string().optional(),
    }),
  }),
);

type SourceConfig = z.infer<typeof SourceConfigSchema>;

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
    try {
      const response = await fetch(source.url, { signal: controller.signal });
      html = await response.text();
    } finally {
      clearTimeout(timeout);
    }

    const $ = load(html);
    const linkElements = $(source.selectors.articleLink);

    const articles: { source_url: string; article_url: string; title: string; lead: string }[] = [];

    linkElements.each((index, el) => {
      const title = $(el).text().trim();
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
      }

      articles.push({ source_url: source.url, article_url, title, lead });
    });

    if (articles.length === 0) {
      console.log(`${source.name}: 0 nowych, 0 duplikatów`);
      continue;
    }

    const dbRows = articles.map(({ source_url, article_url }) => ({ source_url, article_url }));

    const { data, error } = await supabase
      .from("articles_seen")
      .upsert(dbRows, { onConflict: "source_url,article_url", ignoreDuplicates: true })
      .select("id");

    if (error) {
      console.error(`${source.name}: Supabase error: ${error.message}`);
      continue;
    }

    const newCount = data.length;
    const duplicateCount = articles.length - newCount;

    totalNew += newCount;
    totalDuplicates += duplicateCount;

    console.log(`${source.name}: ${newCount} nowych, ${duplicateCount} duplikatów`);
  } catch (err) {
    console.error(`${source.name}: Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

console.log("---");
console.log(`Łącznie: ${totalNew} nowych, ${totalDuplicates} duplikatów`);
