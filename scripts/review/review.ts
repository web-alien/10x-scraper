import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { query } from "@anthropic-ai/claude-agent-sdk";

import { REVIEW_JSON_SCHEMA, REVIEW_SCHEMA, SYSTEM_PROMPT, type Review } from "./review-schema.ts";

// Domyślny model review; nadpisywalny argumentem lub env REVIEW_MODEL (np. dla evala haiku vs sonnet).
export const DEFAULT_REVIEW_MODEL = "claude-sonnet-4-6";

// Wynik review wraz z metrykami kosztu/tokenów (do matrycy promptfoo).
export interface ReviewResult {
  review: Review;
  costUsd: number;
  tokenUsage: { input: number; output: number; total: number };
}

// Czytanie diffa ze stdin (np. `git diff | npx tsx scripts/review/review.ts`)
async function readDiff(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

// Pełne review: zwraca werdykt + koszt/tokeny. Używane przez provider promptfoo (matryca kosztu).
export async function reviewDetailed(
  diff: string,
  model: string = process.env.REVIEW_MODEL ?? DEFAULT_REVIEW_MODEL,
): Promise<ReviewResult> {
  const result = query({
    prompt: `Zrecenzuj ten diff:\n\n${diff}`,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      model,
      tools: [],
      maxTurns: 2,
      outputFormat: { type: "json_schema", schema: REVIEW_JSON_SCHEMA },
    },
  });

  for await (const message of result) {
    if (message.type !== "result") continue;

    if (message.subtype === "success") {
      const inputTokens = message.usage.input_tokens;
      const outputTokens = message.usage.output_tokens;

      // Koszt i zużycie tokenów czytamy wprost z odpowiedzi (na stderr, żeby nie psuć JSON-a na stdout)
      console.error(
        `[usage] ${model} · ${inputTokens} in / ${outputTokens} out · ` +
          `$${message.total_cost_usd.toFixed(4)} · ${message.num_turns} tur`,
      );

      const parsed = REVIEW_SCHEMA.safeParse(message.structured_output);
      if (!parsed.success) throw new Error(`Niepoprawny structured output: ${parsed.error.message}`);
      return {
        review: parsed.data,
        costUsd: message.total_cost_usd,
        tokenUsage: { input: inputTokens, output: outputTokens, total: inputTokens + outputTokens },
      };
    }

    throw new Error(`Review nie powiodło się (${message.subtype}): ${message.errors.join("; ")}`);
  }

  throw new Error("Agent nie zwrócił wyniku");
}

// Proces review na podstawie git diffa. Stabilny kontrakt — zwraca sam werdykt (entry-point, pipeline).
export async function review(diff: string, model?: string): Promise<Review> {
  return (await reviewDetailed(diff, model)).review;
}

// Entry point: uruchamiany tylko gdy plik jest wywołany bezpośrednio (nie przy imporcie przez provider).
const isEntryPoint = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (isEntryPoint) {
  const diff = await readDiff();
  if (!diff.trim()) {
    console.error("Brak diffa na stdin. Użyj: git diff | npx tsx scripts/review/review.ts");
    process.exit(1);
  }
  console.log(JSON.stringify(await review(diff), null, 2));
}
