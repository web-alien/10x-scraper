import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

/**
 * Sędzia dla asercji `llm-rubric` przez Claude Agent SDK (autoryzacja jak Claude Code / subskrypcja),
 * zamiast domyślnego sędziego OpenAI. Dzięki temu `npm run eval` nie wymaga OPENAI_API_KEY.
 * promptfoo woła callApi z gotowym promptem oceniającym i oczekuje JSON-a { pass, score, reason }.
 */

const GradeSchema = z.object({
  pass: z.boolean().describe("Czy odpowiedź spełnia kryterium rubryki"),
  score: z.number().describe("Wynik 0..1 (1 = w pełni spełnia)"),
  reason: z.string().describe("Krótkie uzasadnienie oceny"),
});

const GRADE_JSON_SCHEMA = z.toJSONSchema(GradeSchema, { target: "draft-07" });

interface ProviderResponse {
  output?: string;
  error?: string;
}

export default class GraderProvider {
  private readonly model: string;

  constructor(opts: { config?: { model?: string } } = {}) {
    this.model = opts.config?.model ?? "claude-haiku-4-5";
  }

  id(): string {
    return "sdk-grader";
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    try {
      const result = query({
        prompt,
        options: {
          systemPrompt:
            "Jesteś rygorystycznym sędzią ewaluacji. Oceń, czy odpowiedź spełnia podane kryterium. " +
            "Zwróć wyłącznie ustrukturyzowaną ocenę.",
          model: this.model,
          tools: [],
          // 2 tury: structured output potrzebuje osobnej tury na sformatowanie wyniku.
          maxTurns: 2,
          outputFormat: { type: "json_schema", schema: GRADE_JSON_SCHEMA },
        },
      });

      for await (const message of result) {
        if (message.type === "result" && message.subtype === "success") {
          return { output: JSON.stringify(message.structured_output) };
        }
      }
      return { error: "grader: agent nie zwrócił oceny" };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
}
