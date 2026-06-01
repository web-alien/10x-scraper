import "dotenv/config";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { createScriptClient } from "@/lib/supabase-script";
import { Resend } from "resend";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

const SubscribersSchema = z.array(z.email());
type Subscribers = z.infer<typeof SubscribersSchema>;

export interface Article {
  id: string;
  source_url: string;
  article_url: string;
  title: string | null;
  lead: string | null;
}

export async function runDigest(
  articles: Article[],
  subscribers: string[],
  resend: Pick<Resend, "emails">,
  supabase: SupabaseClient<Database>,
  fromEmail: string,
): Promise<{ failedCount: number }> {
  const grouped = new Map<string, Article[]>();
  for (const article of articles) {
    const host = new URL(article.source_url).hostname;
    const group = grouped.get(host) ?? [];
    group.push(article);
    grouped.set(host, group);
  }

  const subject = `Digest — ${articles.length} nowych artykułów — ${new Date().toLocaleDateString("pl-PL")}`;

  let html = `<h1>${subject}</h1>`;
  for (const [hostname, group] of grouped) {
    html += `<h2>${hostname}</h2>`;
    for (const article of group) {
      const titleText = article.title ?? article.article_url;
      html += `<p><strong><a href="${article.article_url}">${titleText}</a></strong></p>`;
      if (article.lead) {
        html += `<p>${article.lead}</p>`;
      }
    }
  }

  let failedCount = 0;
  for (const email of subscribers) {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [email],
      subject,
      html,
    });
    if (error) {
      console.error(`${email}: Resend error:`, error.message);
      failedCount++;
    } else {
      console.log(`${email}: wysłano (id: ${data.id})`);
    }
  }

  const { error: updateError } = await supabase
    .from("articles_seen")
    .update({ digest_sent_at: new Date().toISOString() })
    .in(
      "id",
      articles.map((a) => a.id),
    );

  if (updateError) {
    // do not exit — articles are considered "sent" regardless of mark failure
    console.error("Failed to mark articles as sent:", updateError.message);
  }

  return { failedCount };
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] === __filename) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;

  if (!supabaseUrl || !supabaseServiceRoleKey || !resendApiKey || !resendFromEmail) {
    console.error(
      "Error: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, and RESEND_FROM_EMAIL must be set in .env",
    );
    process.exit(1);
  }

  let subscribers: Subscribers;
  try {
    const raw = readFileSync("subscribers.json", "utf-8");
    subscribers = SubscribersSchema.parse(JSON.parse(raw));
  } catch (err) {
    console.error("Error loading subscribers.json:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const supabase = createScriptClient(supabaseUrl, supabaseServiceRoleKey);
  const resend = new Resend(resendApiKey);

  console.log("Digest starting…");

  // Articles older than 24h with digest_sent_at IS NULL are intentionally skipped — they age out silently.
  const cutoff = new Date(Date.now() - 86_400_000).toISOString();

  const { data: articles, error: queryError } = await supabase
    .from("articles_seen")
    .select("id, source_url, article_url, title, lead")
    .is("digest_sent_at", null)
    .gt("seen_at", cutoff)
    .order("seen_at", { ascending: true });

  if (queryError) {
    console.error("Supabase query error:", queryError.message);
    process.exit(1);
  }

  if (articles.length === 0) {
    console.log("Brak nowych artykułów w ostatnich 24h, pomijam wysyłkę.");
    process.exit(0);
  }

  const { failedCount } = await runDigest(articles, subscribers, resend, supabase, resendFromEmail);

  console.log("---");
  console.log(`Wysłano: ${articles.length} artykułów → ${subscribers.length} subskrybentów`);

  if (failedCount > 0) process.exit(1);
}
