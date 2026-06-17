import { query } from "@anthropic-ai/claude-agent-sdk";

import { REVIEW_JSON_SCHEMA, REVIEW_SCHEMA, SYSTEM_PROMPT, type Review } from "./review-schema";

// Czytanie diffa ze stdin (np. `git diff | npx tsx scripts/review/review.ts`)
async function readDiff(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

// Proces review na podstawie git diffa
async function review(diff: string): Promise<Review> {
  const result = query({
    prompt: `Zrecenzuj ten diff:\n\n${diff}`,
    options: {
      systemPrompt: SYSTEM_PROMPT,
      model: "claude-sonnet-4-6",
      tools: [],
      maxTurns: 2,
      outputFormat: { type: "json_schema", schema: REVIEW_JSON_SCHEMA },
    },
  });

  for await (const message of result) {
    if (message.type !== "result") continue;

    if (message.subtype === "success") {
      // Koszt i zużycie tokenów czytamy wprost z odpowiedzi (na stderr, żeby nie psuć JSON-a na stdout)
      console.error(
        `[usage] ${message.usage.input_tokens} in / ${message.usage.output_tokens} out · ` +
          `$${message.total_cost_usd.toFixed(4)} · ${message.num_turns} tur`,
      );

      const parsed = REVIEW_SCHEMA.safeParse(message.structured_output);
      if (!parsed.success) throw new Error(`Niepoprawny structured output: ${parsed.error.message}`);
      return parsed.data;
    }

    throw new Error(`Review nie powiodło się (${message.subtype}): ${message.errors.join("; ")}`);
  }

  throw new Error("Agent nie zwrócił wyniku");
}

// Entry point całego procesu
const diff = await readDiff();
if (!diff.trim()) {
  console.error("Brak diffa na stdin. Użyj: git diff | npx tsx scripts/review/review.ts");
  process.exit(1);
}
console.log(JSON.stringify(await review(diff), null, 2));
