import { z } from "zod";

/**
 * Wspólny kontrakt agenta code review (M5L2 → M5L3).
 * Jedno źródło prawdy dla promptu systemowego i schematu wyjścia.
 * Kryteria dopasowane do stacku tego repo — patrz context/changes/ci-cd-code-review/requirements.md.
 */

export const SYSTEM_PROMPT = `Jesteś precyzyjnym, konstruktywnym recenzentem kodu oceniającym pull request
w projekcie Astro 6 (SSR, output: "server") z wyspami React 19, autoryzacją Supabase (@supabase/ssr)
i deploymentem na Cloudflare Workers. Oceń podany diff w pięciu kryteriach dopasowanych do tego stacku,
w skali 1-10 (1 = poważne braki, 10 = wzorowo):

1. ssrCorrectness — Poprawność SSR/Astro: API routes mają "export const prerender = false";
   sekrety tylko przez "astro:env/server"; brak wycieku SUPABASE_KEY na klienta.
2. reactIslands — Higiena wysp React: interaktywność tylko tam, gdzie konieczna; brak dyrektyw
   Next ("use client"); hooki w src/components/hooks/; statyczny content w .astro.
3. supabaseRls — Supabase auth + RLS: nowe tabele mają włączone RLS i granularne polityki
   per-operacja/per-rola; poprawne użycie cookie-based SSR clienta; respektowanie PROTECTED_ROUTES.
4. idiomaticity — Idiomatyczność projektu: cn() do łączenia klas (nie konkatenacja), alias @/*,
   walidacja inputu API przez zod, wzorce shadcn/ui, uppercase GET/POST w API routes.
5. security — Bezpieczeństwo: brak hardcoded sekretów/tokenów, brak injection (URL/SQL),
   walidacja inputu, brak sekretów w logach.

Następnie wydaj wiążący werdykt (pass/fail) dla całej zmiany i dołącz krótkie podsumowanie (2-3 zdania)
w Markdown, na podstawie którego autor PR-a będzie mógł działać. Poważne naruszenie bezpieczeństwa
lub poprawności SSR powinno skutkować werdyktem "fail" niezależnie od pozostałych kryteriów.`;

// Score'y trzymamy jako zwykłe z.number(): structured output Anthropica odrzuca
// minimum/maximum na typie integer, więc zakres 1-10 wymuszamy opisem pola i promptem,
// a nie samym schematem.
export const REVIEW_SCHEMA = z.object({
  ssrCorrectness: z
    .number()
    .describe("Poprawność SSR/Astro: prerender=false na API, sekrety tylko server-side (skala 1-10)"),
  reactIslands: z
    .number()
    .describe("Higiena wysp React: interaktywność tylko gdy trzeba, brak dyrektyw Next, hooki w hooks/ (skala 1-10)"),
  supabaseRls: z
    .number()
    .describe("Supabase auth + RLS: granularne polityki na nowych tabelach, poprawny SSR client (skala 1-10)"),
  idiomaticity: z
    .number()
    .describe("Idiomatyczność projektu: cn(), alias @/*, zod na inpucie API, wzorce shadcn/ui (skala 1-10)"),
  security: z
    .number()
    .describe("Bezpieczeństwo: brak hardcoded sekretów, brak injection, walidacja inputu (skala 1-10)"),
  verdict: z.enum(["pass", "fail"]).describe("Wiążący werdykt dla całej zmiany"),
  summary: z.string().describe("Podsumowanie w Markdown, gotowe jako komentarz do PR-a"),
});

// Claude Agent SDK przyjmuje JSON Schema (draft-07) wyprowadzony z tego samego obiektu zoda.
export const REVIEW_JSON_SCHEMA = z.toJSONSchema(REVIEW_SCHEMA, { target: "draft-07" });

export type Review = z.infer<typeof REVIEW_SCHEMA>;
