// Jawne rozszerzenie .ts — loader promptfoo (natywny ESM) nie dorabia rozszerzeń jak tsx.
import { reviewDetailed } from "../scripts/review/review.ts";

/**
 * Custom provider promptfoo owijający realną funkcję review() agenta.
 * Dwa wpisy w promptfooconfig.yaml wskazują ten sam plik z różnym config.model
 * (haiku 4.5 vs sonnet 4.6) — testujemy prawdziwy kontrakt + schemat na obu modelach.
 */

interface ProviderConstructorOpts {
  id?: string;
  label?: string;
  config?: { model?: string };
}

interface CallApiContext {
  vars: Record<string, string>;
}

interface ProviderResponse {
  output?: string;
  error?: string;
  cost?: number;
  tokenUsage?: { total: number; prompt: number; completion: number };
}

export default class ReviewProvider {
  private readonly providerId: string;
  private readonly config: { model?: string };

  constructor(opts: ProviderConstructorOpts = {}) {
    this.config = opts.config ?? {};
    this.providerId = opts.label ?? opts.id ?? "review-provider";
  }

  id(): string {
    return this.providerId;
  }

  async callApi(_prompt: string, context: CallApiContext): Promise<ProviderResponse> {
    const diff = context.vars.diff;
    if (!diff) {
      return { error: "Brak zmiennej 'diff' w teście (vars.diff)" };
    }

    try {
      const { review, costUsd, tokenUsage } = await reviewDetailed(diff, this.config.model);
      return {
        output: JSON.stringify(review),
        cost: costUsd,
        tokenUsage: { total: tokenUsage.total, prompt: tokenUsage.input, completion: tokenUsage.output },
      };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
}
