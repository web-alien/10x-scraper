# Requirements — AI Code Review w CI/CD

Jedno źródło prawdy dla agenta review (`scripts/review/`), evala (`evals/`) i pipeline'u
(`.github/actions/ai-reviewer`, `.github/workflows/review.yml`). Zmiana kryteriów tutaj
pociąga za sobą aktualizację `SYSTEM_PROMPT` + `REVIEW_SCHEMA` i przejście evala.

## Koncepcja

Agent oparty na Claude Agent SDK ocenia `git diff` PR-a w pięciu kryteriach dopasowanych
do tego repo, wydaje wiążący werdykt `pass`/`fail`, a pipeline zamienia werdykt w twardą
bramkę merge (exit ≠ 0 na `fail`) plus widoczny feedback na PR (komentarz + label).

## Inputy

- **diff** — `git diff origin/<base>...HEAD` (pełny diff PR-a względem base; `fetch-depth: 0`).
- **pr-title**, **pr-body** — kontekst zmiany (`github.event.pull_request.*`).
- **model** — `REVIEW_MODEL` / input `model`, domyślnie `claude-sonnet-4-6`.
- **api-key** — `ANTHROPIC_API_KEY` (lokalnie `.env`/`.dev.vars`, w CI sekret repo).

## CR_CRITERIA

Każde kryterium oceniane w skali 1–10 (1 = poważne braki, 10 = wzorowo). Zakres wymuszany
opisem pola + promptem (structured output Anthropica odrzuca min/max na integerze).

1. **ssrCorrectness — Poprawność SSR/Astro.** API routes mają `export const prerender = false`;
   sekrety tylko przez `astro:env/server`; brak wycieku `SUPABASE_KEY` na klienta;
   `output: "server"` respektowany.
2. **reactIslands — Higiena wysp React.** Interaktywność tylko tam, gdzie konieczna; brak dyrektyw
   Next ("use client" itp.); hooki w `src/components/hooks/`; statyczny content w `.astro`.
3. **supabaseRls — Supabase auth + RLS.** Nowe tabele mają włączone RLS i granularne polityki
   per-operacja/per-rola; poprawne użycie cookie-based SSR clienta (`@supabase/ssr`);
   respektowanie `PROTECTED_ROUTES` i `context.locals.user`.
4. **idiomaticity — Idiomatyczność projektu.** `cn()` do łączenia klas (nie konkatenacja),
   alias `@/*`, walidacja inputu API przez zod, wzorce shadcn/ui ("new-york"),
   uppercase `GET`/`POST` w API routes.
5. **security — Bezpieczeństwo.** Brak hardcoded sekretów/tokenów, brak injection (URL/SQL),
   walidacja inputu, brak sekretów w logach.

## Side-effects (pipeline)

- **Komentarz na PR** — treść z pola `summary` agenta (Markdown), publikowany przez `gh`.
- **Label werdyktu** — `ai-cr:passed` przy `verdict: pass`, `ai-cr:failed` przy `verdict: fail`
  (przeciwny label zdejmowany, żeby stan był jednoznaczny).
- **Bramka merge** — `verdict: fail` ⇒ krok kończy się exit ≠ 0 (czerwony check blokuje merge).
- **Retry** — dodanie labela `ai-cr:review` na PR ponownie uruchamia review (`pull_request: labeled`).

## Triggery pipeline'u

- `pull_request` (opened/synchronize/reopened) na `master`.
- `pull_request` `labeled` — retry przy `ai-cr:review`.
- `workflow_dispatch` — ręczne odpalenie.

## Decyzja modelu

Wybierana świadomie na podstawie matrycy evala (`npm run eval`, haiku 4.5 vs sonnet 4.6)
i ustawiana jako `REVIEW_MODEL` w workflow. Eval pełni rolę regression gate przed zmianami promptu.
