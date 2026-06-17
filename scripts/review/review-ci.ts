import { appendFileSync, writeFileSync } from "node:fs";

import { reviewDetailed, DEFAULT_REVIEW_MODEL } from "./review";

/**
 * Wejście CI dla composite action `.github/actions/ai-reviewer`.
 * Czyta diff ze stdin (mapowany z inputu akcji przez env, by uniknąć script-injection),
 * tytuł/treść/model z env. Zapisuje:
 *   - verdict do $GITHUB_OUTPUT (mała, bezpieczna wartość — bramka i label w workflow),
 *   - summary do pliku review-summary.md (treść komentarza PR) i do $GITHUB_STEP_SUMMARY.
 * NIE kończy się exitem ≠ 0 na fail — bramka merge to osobny krok workflow, po side-effectach.
 */

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

function setOutput(name: string, value: string): void {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) {
    console.log(`${name}=${value}`);
    return;
  }
  // Heredoc z losowym delimiterem — bezpieczne także dla wartości wieloliniowych.
  const delimiter = `EOF_${Math.random().toString(36).slice(2)}`;
  appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

const diff = (await readStdin()).trim();
if (!diff) {
  console.error("Brak diffa na stdin — nic do recenzji.");
  // Pusty diff traktujemy jako pass (brak zmian do zablokowania).
  setOutput("verdict", "pass");
  writeFileSync(`${process.env.GITHUB_WORKSPACE ?? "."}/review-summary.md`, "Brak zmian w diffie — review pominięte.");
  process.exit(0);
}

const model = process.env.REVIEW_MODEL?.trim() ? process.env.REVIEW_MODEL : DEFAULT_REVIEW_MODEL;
const prTitle = process.env.PR_TITLE ?? "";
const prBody = process.env.PR_BODY ?? "";

// Kontekst PR-a (tytuł/treść) traktujemy jak niezaufany input — wstrzykujemy tylko jako tekst do promptu diffa.
const context = [prTitle && `Tytuł PR: ${prTitle}`, prBody && `Opis PR:\n${prBody}`].filter(Boolean).join("\n\n");
const diffWithContext = context ? `${context}\n\n---\n\n${diff}` : diff;

const { review, costUsd, tokenUsage } = await reviewDetailed(diffWithContext, model);

const scores = [
  `- SSR/Astro: ${review.ssrCorrectness}/10`,
  `- Wyspy React: ${review.reactIslands}/10`,
  `- Supabase/RLS: ${review.supabaseRls}/10`,
  `- Idiomatyczność: ${review.idiomaticity}/10`,
  `- Bezpieczeństwo: ${review.security}/10`,
].join("\n");

const emoji = review.verdict === "pass" ? "✅" : "❌";
const commentBody = [
  `## ${emoji} AI Code Review — werdykt: \`${review.verdict}\``,
  "",
  review.summary,
  "",
  "### Oceny kryteriów",
  scores,
  "",
  `<sub>Model: \`${model}\` · ${tokenUsage.input} in / ${tokenUsage.output} out · $${costUsd.toFixed(4)}</sub>`,
].join("\n");

// Komentarz PR-a (czytany przez workflow do `gh pr comment`).
writeFileSync(`${process.env.GITHUB_WORKSPACE ?? "."}/review-summary.md`, commentBody);

// Werdykt dla workflow (label + bramka merge).
setOutput("verdict", review.verdict);

// Job summary — widoczne w logach (przydatne do zrzutu na badge 10xChampion).
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${commentBody}\n`);
}

console.log(`[review-ci] verdict=${review.verdict} model=${model} cost=$${costUsd.toFixed(4)}`);
console.log(commentBody);
